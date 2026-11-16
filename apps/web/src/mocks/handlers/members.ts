/**
 * Mock handlers for workspace members and invitations.
 */
import type { Invitation, Member } from '@taskflow/api-contract';
import { db, mockId } from '../db';
import {
  authenticate,
  canManage,
  forbidden,
  http,
  membershipOf,
  notFound,
  problem,
  unauthorized,
  validationProblem,
} from '../http';

let invitationsCreated = 0;

export const memberHandlers = [
  http.get('/workspaces/{workspaceId}/members', ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    if (!membershipOf(caller.userId, params.workspaceId))
      return response(404).json(notFound('Workspace'));

    const members: Member[] = (db.memberships.get(params.workspaceId) ?? []).map((m) => {
      const u = db.users.find((x) => x.id === m.userId)!;
      return {
        user: { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null },
        role: m.role,
        projectIds: m.projectIds,
        joinedAt: m.joinedAt,
      };
    });
    const invitations: Invitation[] = db.invitations
      .filter((i) => i.workspaceId === params.workspaceId)
      .map(({ workspaceId: _w, token: _t, ...invitation }) => invitation);
    return response(200).json({ members, invitations });
  }),

  http.post('/workspaces/{workspaceId}/invitations', async ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    const m = membershipOf(caller.userId, params.workspaceId);
    if (!m) return response(404).json(notFound('Workspace'));
    if (!canManage(m.role)) return response(403).json(forbidden('Only owners and admins invite'));

    const body = await request.json();
    if (body.role === 'admin' && m.role !== 'owner') {
      return response(403).json(forbidden('Only the owner can invite an admin'));
    }
    // The rule the schema can't express: viewers need projects, other roles must not have them.
    if (body.role === 'viewer' && !body.projectIds?.length) {
      return response(422).json(
        validationProblem([
          { field: 'projectIds', message: 'Pick at least one project for a viewer' },
        ]),
      );
    }
    if (body.role !== 'viewer' && body.projectIds) {
      return response(422).json(
        validationProblem([
          { field: 'projectIds', message: 'Only viewers are limited to projects' },
        ]),
      );
    }

    const already =
      db.invitations.some((i) => i.workspaceId === params.workspaceId && i.email === body.email) ||
      (db.memberships.get(params.workspaceId) ?? []).some(
        (x) => db.users.find((u) => u.id === x.userId)?.email === body.email,
      );
    if (already)
      return response(409).json(problem(409, 'already-member', 'Already a member or invited'));

    const invitation = {
      // A counter, not the list length: accepted invitations are removed, and a reused
      // id would give two invitations the same token.
      id: mockId(900 + invitationsCreated++),
      email: body.email,
      role: body.role,
      projectIds: body.projectIds ?? null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };
    // The real server returns a random token once and stores only its hash.
    const token = `mock-invite-${invitation.id}`;
    db.invitations.push({ ...invitation, workspaceId: params.workspaceId, token });
    return response(201).json({ ...invitation, token });
  }),

  http.get('/invitations/{token}', ({ params, response }) => {
    const invitation = db.invitations.find((i) => i.token === params.token);
    const workspace = db.workspaces.find((w) => w.id === invitation?.workspaceId);
    if (!invitation || !workspace) return response(404).json(notFound('Invitation'));
    return response(200).json({
      workspaceName: workspace.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  }),

  http.post('/invitations/{token}/accept', ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    const invitation = db.invitations.find((i) => i.token === params.token);
    const workspace = db.workspaces.find((w) => w.id === invitation?.workspaceId);
    if (!invitation || !workspace) return response(404).json(notFound('Invitation'));
    const user = db.users.find((u) => u.id === caller.userId);
    if (user?.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return response(403).json(forbidden('This invitation is for another email address.'));
    }
    if (membershipOf(caller.userId, workspace.id)) {
      return response(409).json(problem(409, 'already-member', 'Already a member'));
    }
    const members = db.memberships.get(workspace.id) ?? [];
    members.push({
      userId: caller.userId,
      role: invitation.role,
      projectIds: invitation.projectIds,
      joinedAt: new Date().toISOString(),
    });
    db.memberships.set(workspace.id, members);
    db.invitations = db.invitations.filter((i) => i !== invitation);
    return response(200).json({ ...workspace, role: invitation.role });
  }),
];
