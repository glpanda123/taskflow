'use client';

/**
 * Dev playground for the mock API (temporary — replaced by the real screens).
 *
 * Also the reference example for the data layer: reads with a query hook, writes with a
 * mutation hook, and the 409 conflict handled from the mutation's error.
 */
import type { Task } from '@taskflow/api-contract';
import { useEffect, useState } from 'react';
import { conflictTask, errorMessage } from '@/lib/api/errors';
import { useTasks, useUpdateTask } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';

const PROJECT_ID = '00000000-0000-4000-8000-000000000200'; // "Website redesign" in the mock seed

export default function DevPlayground() {
  const { status, login } = useAuth();

  // Demo shortcut: log in as the seeded owner. Real pages use <RequireAuth> + the login screen.
  useEffect(() => {
    if (status === 'anonymous') void login({ email: 'ly@taskflow.dev', password: 'password123' });
  }, [status, login]);

  if (status !== 'authenticated') return <p className="p-6 text-muted-foreground">Signing in…</p>;
  return <TaskEditor />;
}

function TaskEditor() {
  const tasks = useTasks(PROJECT_ID, ['todo', 'in_progress']);
  const updateTask = useUpdateTask(PROJECT_ID);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ mine: string; current: Task } | null>(null);

  function save(task: Task, title: string) {
    updateTask.mutate(
      { taskId: task.id, version: task.version, title }, // the version we last read
      {
        onSuccess: () => setDrafts(({ [task.id]: _saved, ...rest }) => rest),
        onError: (error) => {
          const current = conflictTask(error);
          // Don't retry blindly: show what changed and let the user decide.
          if (current) setConflict({ mine: title, current });
        },
      },
    );
  }

  if (tasks.isPending) return <p className="p-6 text-muted-foreground">Loading tasks…</p>;
  if (tasks.isError)
    return <p className="p-6 text-status-overdue-text">{errorMessage(tasks.error)}</p>;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-title font-semibold">Mock API playground</h1>
      <p className="text-muted-foreground">
        Logged in as Ly (owner). Open <b>Mock API</b> (bottom-right), tick the 409 switch, then save
        a title. Watch the request in DevTools → Network.
      </p>

      {updateTask.isError && !conflict && (
        <p
          role="alert"
          className="rounded-control bg-status-overdue-subtle p-2 text-status-overdue-text"
        >
          {errorMessage(updateTask.error)}
        </p>
      )}

      {conflict && (
        <div
          role="alert"
          className="space-y-2 rounded-card border border-amber-400 bg-amber-50 p-3"
        >
          <p>
            <b>Someone else updated this task.</b> Latest title: “{conflict.current.title}” (version{' '}
            {conflict.current.version}). Your title: “{conflict.mine}”.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-control border border-input bg-card px-3 py-1"
              onClick={() => {
                setConflict(null);
                save(conflict.current, conflict.mine); // re-apply on top of the latest version
              }}
            >
              Keep mine
            </button>
            <button
              type="button"
              className="rounded-control border border-input bg-card px-3 py-1"
              onClick={() => {
                setDrafts(({ [conflict.current.id]: _discarded, ...rest }) => rest);
                setConflict(null);
              }}
            >
              Use theirs
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {tasks.data.map((task) => (
          <li key={task.id} className="flex items-center gap-2 p-2">
            <span className="w-24 shrink-0 text-caption text-muted-foreground">
              {task.status} · {task.position}
            </span>
            <input
              aria-label={`Title of ${task.title}`}
              className="flex-1 rounded-control border border-input px-2 py-1"
              value={drafts[task.id] ?? task.title}
              onChange={(e) => setDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
            />
            <button
              type="button"
              className="rounded-control border border-input px-3 py-1 disabled:opacity-50"
              disabled={updateTask.isPending}
              onClick={() => save(task, drafts[task.id] ?? task.title)}
            >
              Save
            </button>
            <span className="w-8 text-right text-caption text-muted-foreground">
              v{task.version}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
