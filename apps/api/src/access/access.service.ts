import { Injectable } from '@nestjs/common';
import type { Project, Role, Task } from '@prisma/client';
import { isUuid } from '../common/input';
import { forbidden, notFound } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { type Action, decide } from './policy';

/**
 * Loads the facts from the database, asks policy.decide(), and turns "no" into
 * a 403 or 404. Every endpoint that touches workspace data goes through here.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** For actions on a workspace (list or create its projects). Returns the caller's role. */
  async requireWorkspace(userId: string, workspaceId: string, action: Action): Promise<Role> {
    if (!isUuid(workspaceId)) throw notFound();
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    const role = membership?.role ?? null;
    this.enforce(decide(action, { role }));
    return role!; // enforce() threw if there was no membership
  }

  /**
   * For actions inside one project (its tasks). The workspace comes from the project
   * row, never from the URL, so a project ID alone can't reach another tenant.
   */
  async requireProject(
    userId: string,
    projectId: string,
    action: Action,
  ): Promise<{ project: Project; role: Role }> {
    if (!isUuid(projectId)) throw notFound();
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound();
    const [membership, invite] = await Promise.all([
      this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } },
      }),
      this.prisma.projectViewer.findUnique({
        where: { projectId_userId: { projectId, userId } },
      }),
    ]);
    const role = membership?.role ?? null;
    this.enforce(decide(action, { role, invitedToProject: invite !== null }));
    return { project, role: role! };
  }

  /** For actions on one task: the task's project decides, never anything from the URL. */
  async requireTask(
    userId: string,
    taskId: string,
    action: Action,
  ): Promise<{ task: Task; project: Project; role: Role }> {
    if (!isUuid(taskId)) throw notFound();
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw notFound();
    const { project, role } = await this.requireProject(userId, task.projectId, action);
    return { task, project, role };
  }

  private enforce(decision: ReturnType<typeof decide>) {
    if (decision === 'not-found') throw notFound();
    if (decision === 'forbidden') throw forbidden();
  }
}
