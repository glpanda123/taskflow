'use client';

import { taskStatusValues, type Task, type TaskStatus } from '@taskflow/api-contract';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar, DueLabel } from '@/components/task/task-bits';
import { Button } from '@/components/ui/button';
import { conflictTask, errorMessage } from '@/lib/api/errors';
import {
  useCreateTask,
  useCurrentWorkspace,
  useMoveTask,
  useProjects,
  useTasks,
} from '@/lib/api/queries';
import { priorityLabel, statusLabel } from '@/lib/format';
import { TaskDetail } from './task-detail';

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const selectedId = useSearchParams().get('task');
  const router = useRouter();
  const pathname = usePathname();

  const { workspace, canEditTasks } = useCurrentWorkspace();
  const projects = useProjects(workspace?.id);
  const tasks = useTasks(projectId);
  const project = projects.data?.find((p) => p.id === projectId);
  const selected = tasks.data?.find((t) => t.id === selectedId);

  // The open task lives in the URL, so it survives refresh-free navigation and can be linked.
  const select = (id: string | null) =>
    router.replace(id ? `${pathname}?task=${id}` : pathname, { scroll: false });

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

  return (
    <div className="grid min-h-full md:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0 space-y-5 px-4 py-6 md:px-8">
        <header className="space-y-1">
          <p className="text-caption text-muted-foreground">{workspace?.name} / Projects</p>
          <h1 className="text-title font-semibold">{project?.name ?? ' '}</h1>
          {tasks.data && (
            <p className="text-caption text-muted-foreground">
              {tasks.data.filter((t) => t.status === 'done').length} of {tasks.data.length} done
            </p>
          )}
        </header>

        {!canEditTasks && (
          <p className="rounded-control bg-accent px-3 py-2 text-caption text-accent-foreground">
            You can view this project. Owners, admins and members make the changes.
          </p>
        )}

        {canEditTasks && <NewTaskForm projectId={projectId} />}

        {tasks.isPending ? (
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
        <aside
          aria-label="Task details"
          className="fixed inset-0 z-40 overflow-y-auto bg-card md:sticky md:top-0 md:z-auto md:h-dvh md:border-l md:border-border"
        >
          <TaskDetail
            key={selected.id}
            task={selected}
            canEdit={canEditTasks}
            onClose={() => select(null)}
          />
        </aside>
      )}
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
    <form onSubmit={onSubmit} className="flex gap-2">
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
