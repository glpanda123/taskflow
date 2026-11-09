import { Injectable } from '@nestjs/common';
import { Prisma, type TaskStatus, type User } from '@prisma/client';
import type {
  CreateTaskRequest,
  MoveTaskRequest,
  Task,
  TaskPage,
  UpdateTaskRequest,
} from '@taskflow/api-contract/schema';
import { generateKeyBetween } from 'fractional-indexing';
import { isUuid, requiredText } from '../common/input';
import { notFound, validationFailed, versionConflict } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { BadNeighbour, positionBetween } from './position';

/** Board column order; matches the TaskStatus enum order in Postgres. */
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

type TaskRow = Prisma.TaskGetPayload<{ include: { assignee: true } }>;

/** Keyset cursor: the sort key of the last task on the page. Opaque to clients. */
type Cursor = { s: TaskStatus; p: string; i: string };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Cursor;
    if (
      STATUSES.includes(c.s) &&
      typeof c.p === 'string' &&
      typeof c.i === 'string' &&
      isUuid(c.i)
    ) {
      return c;
    }
  } catch {
    // fall through
  }
  throw validationFailed([{ field: 'cursor', message: 'Invalid cursor.' }]);
}

export const toTask = (t: TaskRow): Task => ({
  id: t.id,
  projectId: t.projectId,
  title: t.title,
  description: t.description,
  status: t.status,
  priority: t.priority,
  assignee: t.assignee ? toUserSummary(t.assignee) : null,
  dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
  labels: [], // labels arrive in v1.1 (docs/architecture/02-data-model.md)
  position: t.position,
  version: t.version,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const toUserSummary = (u: User) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl });

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    project: { id: string; workspaceId: string },
    createdById: string,
    input: CreateTaskRequest,
  ): Promise<Task> {
    const title = requiredText(input.title, 'title');
    const status = input.status ?? 'todo';
    if (input.assigneeId) await this.assertAssignable(project.workspaceId, input.assigneeId);

    // Bottom of its column: a key after the current last one.
    const last = await this.prisma.task.findFirst({
      where: { projectId: project.id, status },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const task = await this.prisma.task.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        createdById,
        title,
        description: input.description ?? null,
        status,
        priority: input.priority ?? 'medium',
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
        position: generateKeyBetween(last?.position ?? null, null),
      },
      include: { assignee: true },
    });
    return toTask(task);
  }

  async list(
    projectId: string,
    query: { status: TaskStatus[]; assigneeId?: string; cursor?: string; limit: number },
  ): Promise<TaskPage> {
    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(query.status.length ? { status: { in: query.status } } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    };
    if (query.cursor) {
      // "After (s, p, i)" in board order. Prisma can't compare enums with gt, so
      // "a later column" is spelled as the list of later statuses.
      const c = decodeCursor(query.cursor);
      const later = STATUSES.slice(STATUSES.indexOf(c.s) + 1);
      where.OR = [
        { status: { in: later } },
        { status: c.s, position: { gt: c.p } },
        { status: c.s, position: c.p, id: { gt: c.i } },
      ];
    }
    const rows = await this.prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      take: query.limit + 1, // one extra row tells us whether there is a next page
      include: { assignee: true },
    });
    const page = rows.slice(0, query.limit);
    const lastRow = page.at(-1);
    return {
      items: page.map(toTask),
      nextCursor:
        rows.length > query.limit && lastRow
          ? encodeCursor({ s: lastRow.status, p: lastRow.position, i: lastRow.id })
          : null,
    };
  }

  async get(taskId: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { assignee: true },
    });
    if (!task) throw notFound();
    return toTask(task);
  }

  /**
   * PATCH: only the fields sent change; `null` clears a nullable field.
   * The write itself is updateIfVersion(); this method turns its answer into 200 or 409.
   */
  async update(task: { id: string; workspaceId: string }, input: UpdateTaskRequest): Promise<Task> {
    const changes: Prisma.TaskUncheckedUpdateManyInput = {};
    if (input.title !== undefined) changes.title = requiredText(input.title, 'title');
    if (input.description !== undefined) changes.description = input.description;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.dueDate !== undefined) {
      changes.dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null;
    }
    if (input.assigneeId !== undefined) {
      if (input.assigneeId) await this.assertAssignable(task.workspaceId, input.assigneeId);
      changes.assigneeId = input.assigneeId;
    }

    if (await this.updateIfVersion(task.id, input.version, changes)) return this.get(task.id);
    // 0 rows: someone saved in between (or deleted it). Send back what is there now.
    const current = await this.get(task.id);
    throw versionConflict(input.version, current);
  }

  /**
   * The optimistic-lock write, in ONE statement: apply `changes` and bump `version`,
   * but only if the stored version is still `expectedVersion`. True if this call
   * changed the row; false if another write got there first (Prisma error P2025).
   */
  async updateIfVersion(
    taskId: string,
    expectedVersion: number,
    changes: Prisma.TaskUncheckedUpdateManyInput,
  ): Promise<boolean> {
    try {
      await this.prisma.task.update({
        data: { ...changes, version: expectedVersion + 1 },
        where: { id: taskId, version: expectedVersion },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Drag and drop: a new status and/or a place between two cards. The server owns
   * `position`; only this one row is written. Same 409 rule as PATCH.
   */
  async move(task: { id: string; projectId: string }, input: MoveTaskRequest): Promise<Task> {
    // The target column as it is now, in board order, without the card being moved.
    // A column is at most a few hundred cards in v1, so reading its keys is cheap.
    const column = await this.prisma.task.findMany({
      where: { projectId: task.projectId, status: input.status, id: { not: task.id } },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true },
    });

    let position: string;
    try {
      position = positionBetween(column, input.afterId ?? null, input.beforeId ?? null);
    } catch (error) {
      if (error instanceof BadNeighbour) {
        throw validationFailed([
          { field: error.field, message: 'Not a task in the target column, in this order.' },
        ]);
      }
      throw error;
    }

    const changes = { status: input.status, position };
    if (await this.updateIfVersion(task.id, input.version, changes)) return this.get(task.id);
    const current = await this.get(task.id);
    throw versionConflict(input.version, current);
  }

  /** Tenant rule: only someone who works in the same workspace can be assigned. */
  private async assertAssignable(workspaceId: string, userId: string) {
    const m = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!m || m.role === 'viewer') {
      throw validationFailed([
        { field: 'assigneeId', message: 'Assignee must be a member of this workspace.' },
      ]);
    }
  }
}
