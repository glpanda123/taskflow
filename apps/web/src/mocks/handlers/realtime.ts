/**
 * Mock realtime server: MSW intercepts the browser's WebSocket to /api/v1/realtime,
 * so the client code is the same one that will talk to the real backend.
 *
 * Every tab has its own in-memory db, so there is nobody else to sync with. Instead,
 * "virtual teammates" (other members of the workspace) move tasks forward and add
 * follow-ups every few seconds while you look at a board. Their writes go through the
 * same db rules as a real write: position via fractional indexing, version + 1.
 */
import type { Task, TaskStatus } from '@taskflow/api-contract';
import { generateKeyBetween } from 'fractional-indexing';
import { ws } from 'msw';
import {
  REALTIME_PATH,
  type Actor,
  type ClientMessage,
  type ServerMessage,
} from '@/lib/realtime/protocol';
import { recordActivity } from '../activity';
import { db, mockId, now } from '../db';
import { canSeeProject } from '../http';
import { scenario } from '../scenario';
import { column, workspaceOfProject } from './tasks';

const realtime = ws.link(`*${REALTIME_PATH}`);

const NEXT: Partial<Record<TaskStatus, TaskStatus>> = {
  todo: 'in_progress',
  in_progress: 'in_review',
  in_review: 'done',
};

const FOLLOW_UPS = [
  'Prepare client demo notes',
  'QA pass on staging',
  'Update copy after client feedback',
  'Export assets for handoff',
  'Check analytics events',
  'Fix spacing on mobile header',
];

const pick = <T>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

/** Members of the project's workspace who can edit, except the person watching. */
function teammatesOf(projectId: string, userId: string): Actor[] {
  const workspaceId = workspaceOfProject(projectId);
  if (!workspaceId) return [];
  return (db.memberships.get(workspaceId) ?? [])
    .filter((m) => m.userId !== userId && m.role !== 'viewer')
    .map((m) => db.users.find((u) => u.id === m.userId))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id, name: u.name }));
}

/** One teammate action: move a task one column forward, or add a follow-up when few are left. */
function teammateAction(projectId: string, actor: Actor): ServerMessage | null {
  const open = db.tasks.filter((t) => t.projectId === projectId && t.status !== 'done');

  if (open.length < 4) {
    const last = column(projectId, 'todo').at(-1);
    const task: Task = {
      id: mockId(5000 + db.tasks.length),
      projectId,
      title: pick(FOLLOW_UPS) ?? 'Follow-up',
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee: { id: actor.id, name: actor.name, avatarUrl: null },
      dueDate: null,
      labels: [],
      position: generateKeyBetween(last?.position ?? null, null),
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    db.tasks.push(task);
    recordActivity('task.created', actor.id, task);
    return { type: 'task.changed', projectId, change: 'created', task, actor };
  }

  const task = pick(open);
  const to = task && NEXT[task.status];
  if (!task || !to) return null;
  const from = task.status;
  const bottom = column(projectId, to).at(-1);
  task.status = to;
  task.position = generateKeyBetween(bottom?.position ?? null, null);
  task.version += 1;
  task.updatedAt = now();
  recordActivity('task.moved', actor.id, task, [{ field: 'status', from, to }]);
  return { type: 'task.changed', projectId, change: 'moved', task: { ...task }, actor, from };
}

export const realtimeHandler = realtime.addEventListener('connection', ({ client }) => {
  let userId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = (message: ServerMessage) => client.send(JSON.stringify(message));

  const schedule = (projectId: string, delayMs: number) => {
    timer = setTimeout(() => {
      if (scenario.teammates && userId) {
        const actor = pick(teammatesOf(projectId, userId));
        const message = actor && teammateAction(projectId, actor);
        if (message) send(message);
      }
      schedule(projectId, 9_000 + Math.random() * 6_000);
    }, delayMs);
  };

  client.addEventListener('message', (event) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(event.data)) as ClientMessage;
    } catch {
      return;
    }

    if (message.type === 'auth') {
      userId = db.sessions.get(message.token) ?? null;
      if (!userId) {
        send({ type: 'error', code: 'unauthorized' });
        client.close();
      }
      return;
    }

    if (message.type === 'subscribe') {
      if (!userId) return send({ type: 'error', code: 'unauthorized' });
      if (!canSeeProject(userId, message.projectId))
        return send({ type: 'error', code: 'not_found' });
      clearTimeout(timer);
      send({
        type: 'presence',
        projectId: message.projectId,
        users: teammatesOf(message.projectId, userId).slice(0, 3),
      });
      schedule(message.projectId, 5_000);
    }
  });

  client.addEventListener('close', () => clearTimeout(timer));
});
