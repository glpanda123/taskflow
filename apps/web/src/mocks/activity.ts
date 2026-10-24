/**
 * Activity log for the mock API: every task write records who did what.
 * The real backend writes the same rows in the same transaction as the task change
 * (and publishes them through the outbox for realtime).
 */
import type { ActivityEvent, FieldChange, Task } from '@taskflow/api-contract';
import { db, mockId, now } from './db';

export function actorOf(userId: string): ActivityEvent['actor'] {
  const user = db.users.find((u) => u.id === userId);
  return { id: userId, name: user?.name ?? 'Someone', avatarUrl: null };
}

export function recordActivity(
  type: ActivityEvent['type'],
  actorId: string,
  task: Task,
  changes: FieldChange[] = [],
) {
  db.activity.push({
    id: mockId(20_000 + db.activity.length),
    projectId: task.projectId,
    type,
    actor: actorOf(actorId),
    task: { id: task.id, title: task.title },
    changes,
    createdAt: now(),
  });
}

/** Field-level differences between two versions of a task, as display values. */
export function diffTask(before: Task, after: Task): FieldChange[] {
  const changes: FieldChange[] = [];
  const add = (field: FieldChange['field'], from: string | null, to: string | null) => {
    if (from !== to) changes.push({ field, from, to });
  };
  add('title', before.title, after.title);
  add('description', before.description, after.description);
  add('status', before.status, after.status);
  add('priority', before.priority, after.priority);
  add('assignee', before.assignee?.name ?? null, after.assignee?.name ?? null);
  add('dueDate', before.dueDate, after.dueDate);
  return changes;
}
