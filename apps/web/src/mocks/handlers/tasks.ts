/**
 * Mock handlers for tasks: list (cursor pagination), create, read,
 * PATCH with optimistic locking (409), and move (fractional indexing).
 */
import type { Task, TaskStatus } from '@taskflow/api-contract';
import { generateKeyBetween } from 'fractional-indexing';
import { db, mockId, now } from '../db';
import {
  authenticate,
  canSeeProject,
  canWriteTasks,
  forbidden,
  http,
  notFound,
  problem,
  roleIn,
  unauthorized,
  validationProblem,
} from '../http';
import { diffTask, recordActivity } from '../activity';
import { consume } from '../scenario';

export const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

/** Board order: by status column, then by fractional position (plain string compare). */
export function byBoardOrder(a: Task, b: Task) {
  const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (s !== 0) return s;
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}

export function column(projectId: string, status: TaskStatus) {
  return db.tasks
    .filter((t) => t.projectId === projectId && t.status === status)
    .sort(byBoardOrder);
}

export function workspaceOfProject(projectId: string) {
  return db.projects.find((p) => p.id === projectId)?.workspaceId ?? null;
}

/**
 * Simulates "someone else saved this task a moment ago": bumps the stored version,
 * so the client's version is now stale. Triggered by the dev panel's conflict switch.
 */
function maybeSimulateConcurrentEdit(task: Task) {
  if (!consume('conflictNext')) return;
  const before = { ...task };
  task.title = `${task.title} (edited by Minh)`;
  task.version += 1;
  task.updatedAt = now();
  const minh = db.users.find((u) => u.email === 'minh@taskflow.dev');
  if (minh) recordActivity('task.updated', minh.id, task, diffTask(before, task));
}

export const taskHandlers = [
  http.get('/projects/{projectId}/tasks', ({ params, query, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    // Not visible → 404, never 403, so other tenants' IDs aren't confirmed to exist.
    if (!canSeeProject(caller.userId, params.projectId))
      return response(404).json(notFound('Project'));

    const statuses = query.getAll('status');
    const assigneeId = query.get('assigneeId');
    const limit = Number(query.get('limit') ?? 50);

    const all = db.tasks
      .filter((t) => t.projectId === params.projectId)
      .filter((t) => statuses.length === 0 || statuses.includes(t.status))
      .filter((t) => !assigneeId || t.assignee?.id === assigneeId)
      .sort(byBoardOrder);

    // Mock cursor = base64 of the next offset. The client treats it as opaque, so the real
    // API can switch to a keyset cursor (status, position, id) without any client change.
    const cursor = query.get('cursor');
    const start = cursor ? Number(atob(cursor)) : 0;
    const items = all.slice(start, start + limit);
    const next = start + limit;

    return response(200).json({ items, nextCursor: next < all.length ? btoa(String(next)) : null });
  }),

  http.post('/projects/{projectId}/tasks', async ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    if (!canSeeProject(caller.userId, params.projectId))
      return response(404).json(notFound('Project'));
    const role = roleIn(caller.userId, workspaceOfProject(params.projectId)!);
    if (!canWriteTasks(role)) return response(403).json(forbidden('Viewers cannot create tasks'));

    const body = await request.json();
    if (!body.title?.trim()) {
      return response(422).json(
        validationProblem([{ field: 'title', message: 'Title is required' }]),
      );
    }

    const status = body.status ?? 'todo';
    const last = column(params.projectId, status).at(-1);
    const assignee = body.assigneeId ? db.users.find((u) => u.id === body.assigneeId) : undefined;
    const task: Task = {
      id: mockId(1000 + db.tasks.length),
      projectId: params.projectId,
      title: body.title.trim(),
      description: body.description ?? null,
      status,
      priority: body.priority ?? 'medium',
      assignee: assignee
        ? { id: assignee.id, name: assignee.name, avatarUrl: assignee.avatarUrl ?? null }
        : null,
      dueDate: body.dueDate ?? null,
      labels: body.labels ?? [],
      position: generateKeyBetween(last?.position ?? null, null), // bottom of the column
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    db.tasks.push(task);
    recordActivity('task.created', caller.userId, task);
    return response(201).json(task, { headers: { Location: `/api/v1/tasks/${task.id}` } });
  }),

  http.get('/tasks/{taskId}', ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    const task = db.tasks.find((t) => t.id === params.taskId);
    if (!task || !canSeeProject(caller.userId, task.projectId))
      return response(404).json(notFound('Task'));
    return response(200).json(task);
  }),

  // ── PATCH with optimistic locking ─────────────────────────────────────────────
  // The client sends the `version` it last read. If the stored version moved on,
  // someone else saved in between: reject with 409 and return the current task,
  // instead of silently overwriting their change ("lost update").
  http.patch('/tasks/{taskId}', async ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());

    const task = db.tasks.find((t) => t.id === params.taskId);
    if (!task || !canSeeProject(caller.userId, task.projectId))
      return response(404).json(notFound('Task'));
    if (!canWriteTasks(roleIn(caller.userId, workspaceOfProject(task.projectId)!))) {
      return response(403).json(forbidden('Viewers cannot edit tasks'));
    }

    const body = await request.json();
    if (body.title !== undefined && !body.title.trim()) {
      return response(422).json(
        validationProblem([{ field: 'title', message: 'Title is required' }]),
      );
    }

    maybeSimulateConcurrentEdit(task);

    // 1. The check. In the real API this is one atomic SQL statement:
    //    UPDATE tasks SET ..., version = version + 1 WHERE id = $1 AND version = $2
    //    and "0 rows updated" means conflict. Check-then-write in two steps would race.
    if (body.version !== task.version) {
      return response(409).json({
        ...problem(
          409,
          'version-conflict',
          'Version conflict',
          `You edited version ${body.version}, but the task is now at version ${task.version}.`,
        ),
        current: task,
      });
    }

    // 2. Apply only the fields that were sent. `undefined` = untouched, `null` = clear.
    const before = { ...task };
    const { version: _clientVersion, assigneeId, ...fields } = body;
    if (assigneeId !== undefined) {
      const user = assigneeId ? db.users.find((u) => u.id === assigneeId) : null;
      task.assignee = user
        ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null }
        : null;
    }
    Object.assign(task, fields);

    // 3. Every successful write bumps the version.
    task.version += 1;
    task.updatedAt = now();
    const changes = diffTask(before, task);
    if (changes.length > 0) recordActivity('task.updated', caller.userId, task, changes);
    return response(200).json(task);
  }),

  // ── Move (drag and drop / "Move to") ─────────────────────────────────────────
  // Client says "between afterId and beforeId"; the server owns `position` and
  // generates a key between the two neighbours, so only this one task is written.
  http.post('/tasks/{taskId}/move', async ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());

    const task = db.tasks.find((t) => t.id === params.taskId);
    if (!task || !canSeeProject(caller.userId, task.projectId))
      return response(404).json(notFound('Task'));
    if (!canWriteTasks(roleIn(caller.userId, workspaceOfProject(task.projectId)!))) {
      return response(403).json(forbidden('Viewers cannot move tasks'));
    }

    const body = await request.json();
    maybeSimulateConcurrentEdit(task);
    if (body.version !== task.version) {
      return response(409).json({
        ...problem(
          409,
          'version-conflict',
          'Version conflict',
          'The task changed since you loaded it.',
        ),
        current: task,
      });
    }

    // Neighbours must exist and already be in the target column, otherwise the
    // client's picture of the board is stale or wrong.
    const target = column(task.projectId, body.status).filter((t) => t.id !== task.id);
    const after = body.afterId ? target.find((t) => t.id === body.afterId) : undefined;
    const before = body.beforeId ? target.find((t) => t.id === body.beforeId) : undefined;
    if ((body.afterId && !after) || (body.beforeId && !before)) {
      return response(422).json(
        validationProblem([
          { field: after ? 'beforeId' : 'afterId', message: 'Not a task in the target column' },
        ]),
      );
    }

    // Only one neighbour given → the other side is that neighbour's actual neighbour.
    // Neither given → bottom of the column.
    const indexOf = (t: Task | undefined) => (t ? target.indexOf(t) : -1);
    let lower: string | null;
    let upper: string | null;
    if (after) {
      lower = after.position;
      upper = before?.position ?? target[indexOf(after) + 1]?.position ?? null;
    } else if (before) {
      upper = before.position;
      lower = target[indexOf(before) - 1]?.position ?? null;
    } else {
      lower = target.at(-1)?.position ?? null;
      upper = null;
    }
    const from = task.status;
    task.position = generateKeyBetween(lower, upper);
    task.status = body.status;
    task.version += 1;
    task.updatedAt = now();
    // Reordering inside a column isn't worth a log line; changing column is.
    if (from !== task.status) {
      recordActivity('task.moved', caller.userId, task, [
        { field: 'status', from, to: task.status },
      ]);
    }
    return response(200).json(task);
  }),
];
