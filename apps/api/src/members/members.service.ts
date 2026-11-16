import { Injectable } from '@nestjs/common';
import { type Invitation as InvitationRow, Prisma, type Role } from '@prisma/client';
import type {
  Invitation,
  InvitationCreated,
  InvitationPreview,
  InviteMemberRequest,
  Member,
  WorkspaceMembership,
} from '@taskflow/api-contract/schema';
import { conflict, forbidden, notFound, validationFailed } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { hashInvitationToken, INVITATION_TTL_MS, newInvitationToken } from './invitation-token';

const toInvitation = (i: InvitationRow): Invitation => ({
  id: i.id,
  email: i.email,
  role: i.role,
  projectIds: i.role === 'viewer' ? i.projectIds : null,
  expiresAt: i.expiresAt.toISOString(),
});

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<{ members: Member[]; invitations: Invitation[] }> {
    const [memberships, viewerProjects, invitations] = await Promise.all([
      this.prisma.membership.findMany({
        where: { workspaceId },
        include: { user: true },
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      }),
      // Which projects each viewer may see. Filtered by workspace: a person can be a
      // viewer in two workspaces, and this list must not show the other one's projects.
      this.prisma.projectViewer.findMany({
        where: { project: { workspaceId } },
        orderBy: { addedAt: 'asc' },
      }),
      this.prisma.invitation.findMany({
        where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      members: memberships.map((m) => ({
        user: { id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl },
        role: m.role,
        projectIds:
          m.role === 'viewer'
            ? viewerProjects.filter((v) => v.userId === m.userId).map((v) => v.projectId)
            : null,
        joinedAt: m.joinedAt.toISOString(),
      })),
      invitations: invitations.map(toInvitation),
    };
  }

  async invite(
    workspaceId: string,
    inviter: { id: string; role: Role },
    input: InviteMemberRequest,
  ): Promise<InvitationCreated> {
    // An admin could otherwise create another admin, and that one a third.
    if (input.role === 'admin' && inviter.role !== 'owner') {
      throw forbidden('Only the owner can invite an admin.');
    }
    const projectIds = await this.checkedProjects(workspaceId, input);

    const alreadyMember = await this.prisma.membership.findFirst({
      where: { workspaceId, user: { email: input.email } }, // citext: case-insensitive
    });
    if (alreadyMember) throw conflict('already-member', 'This person is already a member.');

    // An expired invitation that was never used would block a new one (the unique
    // index below only knows "not accepted"), so it is removed first.
    await this.prisma.invitation.deleteMany({
      where: { workspaceId, email: input.email, acceptedAt: null, expiresAt: { lte: new Date() } },
    });

    const token = newInvitationToken();
    try {
      const row = await this.prisma.invitation.create({
        data: {
          workspaceId,
          email: input.email,
          role: input.role,
          projectIds,
          tokenHash: hashInvitationToken(token),
          invitedById: inviter.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });
      // The only moment the token exists outside the link: it is never stored.
      return { ...toInvitation(row), token };
    } catch (error) {
      // The partial unique index (workspace, email) WHERE accepted_at IS NULL: two
      // admins inviting the same person at the same moment can't both succeed.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict('already-invited', 'This person already has a pending invitation.');
      }
      throw error;
    }
  }

  /** The rule the schema can't express: viewers need projects, other roles must not have them. */
  private async checkedProjects(workspaceId: string, input: InviteMemberRequest) {
    const projectIds = [...new Set(input.projectIds ?? [])];
    if (input.role !== 'viewer') {
      if (input.projectIds) {
        throw validationFailed([
          { field: 'projectIds', message: 'Only viewers are limited to projects.' },
        ]);
      }
      return [];
    }
    if (projectIds.length === 0) {
      throw validationFailed([
        { field: 'projectIds', message: 'Pick at least one project for a viewer.' },
      ]);
    }
    // Tenant rule: every project must belong to this workspace.
    const found = await this.prisma.project.count({
      where: { workspaceId, id: { in: projectIds } },
    });
    if (found !== projectIds.length) {
      throw validationFailed([
        { field: 'projectIds', message: 'Every project must belong to this workspace.' },
      ]);
    }
    return projectIds;
  }

  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.findUsable(token);
    return {
      workspaceName: invitation.workspace.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(token: string, userId: string): Promise<WorkspaceMembership> {
    const invitation = await this.findUsable(token);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound();
    // The link alone is not enough: it was sent to one address, and only the account
    // with that address may use it.
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw forbidden('This invitation is for another email address.');
    }
    const { workspaceId } = invitation;
    const existing = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (existing) throw conflict('already-member', 'You are already a member of this workspace.');

    await this.prisma.$transaction(async (tx) => {
      // Claim the invitation in one statement (same pattern as the refresh token and
      // the 409 version check): of two simultaneous requests, only one updates a row.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw notFound();

      await tx.membership.create({ data: { workspaceId, userId, role: invitation.role } });
      if (invitation.role === 'viewer') {
        // A project may have been deleted since the invitation was sent.
        const projects = await tx.project.findMany({
          where: { workspaceId, id: { in: invitation.projectIds } },
          select: { id: true },
        });
        await tx.projectViewer.createMany({
          data: projects.map((p) => ({ projectId: p.id, userId })),
        });
      }
    });

    return {
      id: invitation.workspace.id,
      name: invitation.workspace.name,
      createdAt: invitation.workspace.createdAt.toISOString(),
      role: invitation.role,
    };
  }

  /** Unknown, expired and already used tokens all look the same from outside: 404. */
  private async findUsable(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      include: { workspace: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw notFound();
    }
    return invitation;
  }
}
