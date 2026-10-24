'use client';

import { taskStatusValues, type Task, type TaskStatus } from '@taskflow/api-contract';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { History, LayoutGrid, List, Radio, Sparkles } from 'lucide-react';
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Avatar, DueLabel } from '@/components/task/task-bits';
import { Button } from '@/components/ui/button';
import { ToastStack, type Toast } from '@/components/ui/toast-stack';
import { conflictTask, errorMessage } from '@/lib/api/errors';
import {
  useCreateTask,
  useCurrentWorkspace,
  useMoveTask,
  useProjects,
  useTasks,
} from '@/lib/api/queries';
import { priorityLabel, statusLabel } from '@/lib/format';
import { projectColor } from '@/lib/project-color';
import { useProjectRealtime } from '@/lib/realtime/use-project-realtime';
import { ActivityView } from './activity-view';
import { AiDraftButton } from './ai-draft-dialog';
import { BoardView } from './board-view';
import { TaskDetail } from './task-detail';

type View = 'board' | 'list' | 'activity';

const views = ['board', 'list', 'activity'] as const;
let toastKey = 0;

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('task');
  const requested = searchParams.get('view');
  const view: View = views.find((v) => v === requested) ?? 'board';
  const router = useRouter();
  const pathname = usePathname();

  const { workspace, canEditTasks } = useCurrentWorkspace();
  const projects = useProjects(workspace?.id);
  const tasks = useTasks(projectId);
  const project = projects.data?.find((p) => p.id === projectId);
  const selected = tasks.data?.find((t) => t.id === selectedId);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const dismiss = useCallback(
    (key: number) => setToasts((list) => list.filter((t) => t.key !== key)),
    [],
  );

  /** Show a notice for 5 s; `taskId` also highlights that card on the board. */
  const pushToast = (body: ReactNode, taskId?: string) => {
    const key = ++toastKey;
    setToasts((list) => [...list.slice(-2), { key, body }]);
    if (taskId) setHighlighted((ids) => new Set(ids).add(taskId));
    setTimeout(() => {
      dismiss(key);
      if (taskId)
        setHighlighted((ids) => {
          const next = new Set(ids);
          next.delete(taskId);
          return next;
        });
    }, 5000);
  };

  // Teammates' changes arrive here: the cache is already updated, we only tell the user.
  const { online } = useProjectRealtime(projectId, (event) => {
    const first = event.actor.name.split(' ')[0];
    pushToast(
      <span className="flex items-start gap-2.5">
        <Avatar name={event.actor.name} />
        <span>
          <span className="font-semibold">{first}</span>{' '}
          {event.change === 'created' ? 'added' : 'moved'}{' '}
          <span className="font-medium">{event.task.title}</span>
          {event.change === 'moved' ? ` to ${statusLabel[event.task.status]}` : ''}
          <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
            <Radio aria-hidden className="size-3 text-emerald-600" /> Live
          </span>
        </span>
      </span>,
      event.task.id,
    );
  });

  // The open task and the view live in the URL, so they can be linked and survive navigation.
  const go = (patch: { task?: string | null; view?: View }) => {
    const params = new URLSearchParams(searchParams);
    if (patch.task !== undefined) {
      if (patch.task) params.set('task', patch.task);
      else params.delete('task');
    }
    if (patch.view) {
      if (patch.view === 'board') params.delete('view');
      else params.set('view', patch.view);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const select = (id: string | null) => go({ task: id });

  if (projects.isSuccess && !project) {
    return (
      <div className="p-8">
        <h1 className="text-title font-semibold">Project not found</h1>
        <p className="text-muted-foreground">
          It doesn&apos;t exist, or you haven&apos;t been invited to it.
        </p>
      </div>
    );
  }

  const done = tasks.data?.filter((t) => t.status === 'done').length ?? 0;
  const total = tasks.data?.length ?? 0;

  return (
    <div className="min-h-full">
      <section className="min-w-0 space-y-5 px-4 py-6 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-caption text-muted-foreground">{workspace?.name} / Projects</p>
            <h1 className="flex items-center gap-2.5 text-title font-semibold">
              <span aria-hidden className={`size-3 rounded-[4px] ${projectColor(projectId).dot}`} />
              {project?.name ?? ' '}
            </h1>
            {tasks.data && (
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <span aria-hidden className="h-1.5 w-28 overflow-hidden rounded-pill bg-border">
                  <span
                    className="block h-full rounded-pill bg-status-done transition-[width] duration-500"
                    style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                  />
                </span>
                {done} of {total} done
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {online.length > 0 && (
              <div className="flex items-center gap-2" aria-label="Also here">
                <div className="flex -space-x-1.5">
                  {online.map((u) => (
                    <span key={u.id} className="relative rounded-pill ring-2 ring-background">
                      <Avatar name={u.name} size="md" />
                      <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-pill bg-emerald-500 ring-2 ring-background" />
                    </span>
                  ))}
                </div>
                <span className="text-caption text-muted-foreground">
                  {online.map((u) => u.name.split(' ')[0]).join(', ')} online
                </span>
              </div>
            )}
            <div
              role="group"
              aria-label="View"
              className="inline-flex rounded-control bg-muted p-0.5 ring-1 ring-border"
            >
              {(
                [
                  ['board', 'Board', LayoutGrid],
                  ['list', 'List', List],
                  ['activity', 'Activity', History],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => go({ view: value })}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-[5px] px-3 text-caption font-medium ${view === value ? 'bg-card shadow-xs ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {!canEditTasks && (
          <p className="rounded-control bg-accent px-3 py-2 text-caption text-accent-foreground">
            You can view this project. Owners, admins and members make the changes.
          </p>
        )}

        {canEditTasks && view !== 'activity' && (
          <div className="flex flex-wrap gap-2">
            <NewTaskForm projectId={projectId} />
            <AiDraftButton
              projectId={projectId}
              onAdded={(n) =>
                pushToast(
                  <span className="flex items-center gap-2">
                    <Sparkles aria-hidden className="size-4 text-violet-600" />
                    Added {n} {n === 1 ? 'task' : 'tasks'} to To do
                  </span>,
                )
              }
            />
          </div>
        )}

        {view === 'activity' ? (
          <ActivityView projectId={projectId} onOpenTask={select} />
        ) : tasks.isPending ? (
          <ListSkeleton />
        ) : tasks.isError ? (
          <div role="alert" className="space-y-3 rounded-card border border-border bg-card p-6">
            <p className="font-semibold">We couldn&apos;t load these tasks</p>
            <p className="text-muted-foreground">{errorMessage(tasks.error)}</p>
            <Button variant="secondary" onClick={() => void tasks.refetch()}>
              Try again
            </Button>
          </div>
        ) : tasks.data.length === 0 ? (
          <div className="rounded-card border border-dashed border-input bg-card p-8 text-center">
            <p className="font-semibold">No tasks in this project yet</p>
            <p className="text-muted-foreground">
              {canEditTasks ? 'Add your first task above.' : 'Check back later.'}
            </p>
          </div>
        ) : view === 'board' ? (
          <BoardView
            projectId={projectId}
            tasks={tasks.data}
            canEdit={canEditTasks}
            selectedId={selectedId}
            highlighted={highlighted}
            onSelect={select}
          />
        ) : (
          <TaskGroups
            projectId={projectId}
            tasks={tasks.data}
            canEdit={canEditTasks}
            selectedId={selectedId}
            onSelect={select}
          />
        )}
      </section>

      {selected && (
        <>
          <div
            aria-hidden
            onClick={() => select(null)}
            className="fixed inset-0 z-30 hidden bg-foreground/10 md:block"
          />
          <aside
            aria-label="Task details"
            className="fixed inset-0 z-40 animate-slide-in overflow-y-auto bg-card md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:border-l md:border-border md:shadow-2xl"
          >
            <TaskDetail
              key={selected.id}
              task={selected}
              canEdit={canEditTasks}
              onClose={() => select(null)}
            />
          </aside>
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function TaskGroups({
  projectId,
  tasks,
  canEdit,
  selectedId,
  onSelect,
}: {
  projectId: string;
  tasks: Task[];
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const move = useMoveTask(projectId);
  const [moveError, setMoveError] = useState<string | null>(null);

  function moveTo(task: Task, status: TaskStatus) {
    setMoveError(null);
    // No neighbours → bottom of the target column. Drag and drop (with afterId/beforeId) comes later.
    move.mutate(
      { taskId: task.id, version: task.version, status },
      {
        onError: (error) =>
          setMoveError(
            conflictTask(error)
              ? `"${task.title}" was just changed by someone else. We reloaded it — try again.`
              : errorMessage(error),
          ),
      },
    );
  }

  return (
    <div className="space-y-4">
      {moveError && (
        <p
          role="alert"
          className="rounded-control bg-status-overdue-subtle px-3 py-2 text-caption text-status-overdue-text"
        >
          {moveError}
        </p>
      )}
      {taskStatusValues.map((status) => {
        const inColumn = tasks.filter((t) => t.status === status);
        return (
          <details key={status} open className="rounded-card border border-border bg-card">
            <summary className="flex min-h-touch cursor-pointer items-center gap-2 px-4 font-semibold">
              {statusLabel[status]}
              <span className="rounded-pill bg-muted px-2 text-caption text-muted-foreground">
                {inColumn.length}
              </span>
            </summary>
            {inColumn.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {inColumn.map((task) => (
                  <li
                    key={task.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 ${task.id === selectedId ? 'bg-accent' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(task.id)}
                      className="min-h-touch min-w-0 basis-full truncate text-left font-medium hover:underline sm:min-w-48 sm:basis-auto sm:flex-1"
                    >
                      {task.title}
                    </button>
                    <span className="text-caption text-muted-foreground xl:w-16">
                      {priorityLabel[task.priority]}
                    </span>
                    <span className="flex items-center gap-2 text-caption xl:w-36">
                      {task.assignee ? (
                        <>
                          <Avatar name={task.assignee.name} />
                          <span className="truncate">{task.assignee.name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Not assigned</span>
                      )}
                    </span>
                    <span className="xl:w-44">
                      <DueLabel dueDate={task.dueDate} status={task.status} />
                    </span>
                    {canEdit && (
                      <select
                        aria-label={`Move "${task.title}" to`}
                        value=""
                        disabled={move.isPending}
                        onChange={(e) => moveTo(task, e.target.value as TaskStatus)}
                        className="min-h-touch rounded-control border border-input bg-card px-2 text-caption"
                      >
                        <option value="" disabled>
                          Move to…
                        </option>
                        {taskStatusValues
                          .filter((s) => s !== task.status)
                          .map((s) => (
                            <option key={s} value={s}>
                              {statusLabel[s]}
                            </option>
                          ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
}

function NewTaskForm({ projectId }: { projectId: string }) {
  const create = useCreateTask(projectId);
  const [title, setTitle] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim() }, { onSuccess: () => setTitle('') });
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-64 flex-1 gap-2">
      <label htmlFor="new-task" className="sr-only">
        New task title
      </label>
      <input
        id="new-task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        maxLength={200}
        className="min-h-touch min-w-0 flex-1 rounded-control border border-input bg-card px-3"
      />
      <Button
        type="submit"
        pending={create.isPending}
        pendingLabel="Adding…"
        disabled={!title.trim()}
      >
        Add task
      </Button>
      {create.isError && (
        <p role="alert" className="sr-only">
          {errorMessage(create.error)}
        </p>
      )}
    </form>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks" className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-card bg-border/60" />
      ))}
    </div>
  );
}
