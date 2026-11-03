import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { forbidden, notFound } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { type Action, decide } from './policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads the facts from the database, asks policy.decide(), and turns "no" into
 * a 403 or 404. Every endpoint that touches workspace data goes through here.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For actions on a workspace (list or create its projects). Returns the caller's role.
   * (requireProject, for project:read, comes with the task endpoints.)
   */
  async requireWorkspace(userId: string, workspaceId: string, action: Action): Promise<Role> {
    if (!UUID.test(workspaceId)) throw notFound();
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    const role = membership?.role ?? null;
    this.enforce(decide(action, { role }));
    return role!; // enforce() threw if there was no membership
  }

  private enforce(decision: ReturnType<typeof decide>) {
    if (decision === 'not-found') throw notFound();
    if (decision === 'forbidden') throw forbidden();
  }
}
