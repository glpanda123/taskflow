'use client';

/**
 * Dev playground for the mock API (temporary — replaced by the real screens).
 * Shows the 409 flow end to end: edit a task while "someone else" edits it too.
 * Plain fetch on purpose; the typed client (openapi-fetch + TanStack Query) comes next.
 */
import type { ConflictProblem, Problem, Session, Task, TaskPage } from '@taskflow/api-contract';
import { useEffect, useState } from 'react';

const PROJECT_ID = '00000000-0000-4000-8000-000000000200'; // "Website redesign" in the mock seed

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; problem: Problem };

async function api<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = res.status === 204 ? null : await res.json();
  return res.ok
    ? { ok: true, data: body as T }
    : { ok: false, status: res.status, problem: body as Problem };
}

export default function DevPlayground() {
  const [token, setToken] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ mine: string; current: Task } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(t = token) {
    const res = await api<TaskPage>(
      `/projects/${PROJECT_ID}/tasks?status=todo&status=in_progress`,
      t,
    );
    if (res.ok) setTasks(res.data.items);
    else setError(`${res.status} ${res.problem.title}`);
  }

  useEffect(() => {
    void (async () => {
      const res = await api<Session>('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email: 'ly@taskflow.dev', password: 'password123' }),
      });
      if (!res.ok) return setError(res.problem.title);
      setToken(res.data.accessToken);
      await load(res.data.accessToken);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rename(task: Task, title: string) {
    setError(null);
    const res = await api<Task>(`/tasks/${task.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ version: task.version, title }), // the version we last read
    });
    if (res.ok) {
      setTasks((ts) => ts.map((t) => (t.id === task.id ? res.data : t)));
    } else if (res.status === 409) {
      // Don't retry blindly: show what changed and let the user decide.
      setConflict({ mine: title, current: (res.problem as ConflictProblem).current });
    } else {
      setError(`${res.status} ${res.problem.title}`);
    }
  }

  async function moveUp(task: Task) {
    const column = tasks.filter((t) => t.status === task.status);
    const i = column.findIndex((t) => t.id === task.id);
    if (i < 1) return;
    const res = await api<Task>(`/tasks/${task.id}/move`, token, {
      method: 'POST',
      // "Put me directly above the task that is currently above me."
      body: JSON.stringify({
        version: task.version,
        status: task.status,
        beforeId: column[i - 1]!.id,
      }),
    });
    if (res.ok) await load();
    else setError(`${res.status} ${res.problem.title}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Mock API playground</h1>
      <p className="text-sm text-zinc-600">
        Logged in as Ly (owner). Open <b>Mock API</b> (bottom-right), tick the 409 switch, then save
        a title. Watch the request in DevTools → Network.
      </p>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {conflict && (
        <div
          role="alert"
          className="space-y-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm"
        >
          <p>
            <b>Someone else updated this task.</b> Latest title: “{conflict.current.title}” (version{' '}
            {conflict.current.version}). Your title: “{conflict.mine}”.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border bg-white px-2 py-1"
              onClick={async () => {
                setConflict(null);
                await rename(conflict.current, conflict.mine); // re-apply on top of the latest version
              }}
            >
              Keep mine
            </button>
            <button
              type="button"
              className="rounded border bg-white px-2 py-1"
              onClick={async () => {
                setConflict(null);
                setDrafts(({ [conflict.current.id]: _discarded, ...rest }) => rest);
                await load();
              }}
            >
              Use theirs
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y rounded border">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 p-2">
            <span className="w-24 shrink-0 text-xs text-zinc-500">
              {task.status} · {task.position}
            </span>
            <input
              className="flex-1 rounded border px-2 py-1"
              value={drafts[task.id] ?? task.title}
              onChange={(e) => setDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
            />
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={() => rename(task, drafts[task.id] ?? task.title)}
            >
              Save
            </button>
            <button type="button" className="rounded border px-2 py-1" onClick={() => moveUp(task)}>
              ↑
            </button>
            <span className="w-8 text-right text-xs text-zinc-500">v{task.version}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
