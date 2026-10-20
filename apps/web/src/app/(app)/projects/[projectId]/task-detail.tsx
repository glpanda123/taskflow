'use client';

import {
  priorityValues,
  taskStatusValues,
  type Priority,
  type Task,
  type TaskStatus,
  type UpdateTaskRequest,
} from '@taskflow/api-contract';
import { useState } from 'react';
import { Avatar, DueLabel, StatusBadge } from '@/components/task/task-bits';
import { Button, FormError } from '@/components/ui/button';
import { conflictTask, errorMessage, fieldErrors } from '@/lib/api/errors';
import { useCurrentWorkspace, useMembers, useMoveTask, useUpdateTask } from '@/lib/api/queries';
import { priorityLabel, statusLabel } from '@/lib/format';

/** Only the fields the user changed. Anything not in here shows the server's current value. */
type Draft = Partial<
  Pick<UpdateTaskRequest, 'title' | 'description' | 'priority' | 'assigneeId' | 'dueDate'>
>;

const fieldNames: Record<keyof Draft, string> = {
  title: 'Title',
  description: 'Description',
  priority: 'Priority',
  assigneeId: 'Assignee',
  dueDate: 'Due date',
};

export function TaskDetail({
  task,
  canEdit,
  onClose,
}: {
  task: Task;
  canEdit: boolean;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption text-muted-foreground">Task</p>
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className="-m-2 inline-flex size-touch items-center justify-center rounded-control hover:bg-muted"
        >
          ✕
        </button>
      </div>
      {canEdit ? <EditableTask task={task} /> : <ReadOnlyTask task={task} />}
    </div>
  );
}

function ReadOnlyTask({ task }: { task: Task }) {
  return (
    <>
      <h2 className="text-section font-semibold">{task.title}</h2>
      <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-caption">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StatusBadge status={task.status} />
        </dd>
        <dt className="text-muted-foreground">Priority</dt>
        <dd>{priorityLabel[task.priority]}</dd>
        <dt className="text-muted-foreground">Assignee</dt>
        <dd>{task.assignee?.name ?? 'Not assigned'}</dd>
        <dt className="text-muted-foreground">Due date</dt>
        <dd>
          <DueLabel dueDate={task.dueDate} status={task.status} />
        </dd>
      </dl>
      <div className="space-y-1">
        <h3 className="text-caption font-semibold">Description</h3>
        <p className="whitespace-pre-wrap text-muted-foreground">
          {task.description || 'No description.'}
        </p>
      </div>
    </>
  );
}

function EditableTask({ task }: { task: Task }) {
  const { workspace } = useCurrentWorkspace();
  const members = useMembers(workspace?.id);
  const update = useUpdateTask(task.projectId);
  const move = useMoveTask(task.projectId);
  const [draft, setDraft] = useState<Draft>({});
  const [conflict, setConflict] = useState<Task | null>(null);

  const value = {
    title: draft.title ?? task.title,
    description: 'description' in draft ? draft.description : task.description,
    priority: draft.priority ?? task.priority,
    assigneeId: 'assigneeId' in draft ? draft.assigneeId : (task.assignee?.id ?? null),
    dueDate: 'dueDate' in draft ? draft.dueDate : task.dueDate,
  };
  const dirty = Object.keys(draft).length > 0;
  const assignable = members.data?.members.filter((m) => m.role !== 'viewer') ?? [];

  function save(version: number) {
    update.mutate(
      { taskId: task.id, version, ...draft },
      {
        onSuccess: () => {
          setDraft({});
          setConflict(null);
        },
        onError: (error) => {
          const current = conflictTask(error);
          // Keep the user's edit; show what happened and let them choose.
          if (current) setConflict(current);
        },
      },
    );
  }

  const fields = fieldErrors(update.error);
  const saveError = update.isError && !conflict && !Object.keys(fields).length;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(task.version);
      }}
    >
      {conflict && (
        <div
          role="alert"
          className="space-y-2 rounded-card border border-amber-400 bg-amber-50 p-3 text-caption"
        >
          <p className="font-semibold">Someone else updated this task while you were editing.</p>
          <p>
            The form now shows their latest version. Your edit (
            {(Object.keys(draft) as (keyof Draft)[]).map((k) => fieldNames[k]).join(', ')})
            hasn&apos;t been saved yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => save(conflict.version)} pending={update.isPending}>
              Apply my edit on top
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft({});
                setConflict(null);
                update.reset();
              }}
            >
              Discard my edit
            </Button>
          </div>
        </div>
      )}
      <FormError message={saveError ? errorMessage(update.error) : null} />

      <div className="space-y-1.5">
        <label htmlFor="task-title" className="block text-caption font-semibold">
          Title
        </label>
        <input
          id="task-title"
          required
          maxLength={200}
          value={value.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          aria-invalid={fields.title ? true : undefined}
          className="block min-h-touch w-full rounded-control border border-input px-3 text-section font-semibold"
        />
        {fields.title && <p className="text-caption text-status-overdue-text">{fields.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="task-status" className="block text-caption font-semibold">
            Status
          </label>
          {/* Status changes go through POST /move (the server owns position), so they apply at once. */}
          <select
            id="task-status"
            value={task.status}
            disabled={move.isPending || dirty}
            onChange={(e) =>
              move.mutate({
                taskId: task.id,
                version: task.version,
                status: e.target.value as TaskStatus,
              })
            }
            className="block min-h-touch w-full rounded-control border border-input bg-card px-2"
          >
            {taskStatusValues.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
          {dirty && <p className="text-caption text-muted-foreground">Save your edit first.</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="task-priority" className="block text-caption font-semibold">
            Priority
          </label>
          <select
            id="task-priority"
            value={value.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as Priority }))}
            className="block min-h-touch w-full rounded-control border border-input bg-card px-2"
          >
            {priorityValues.map((p) => (
              <option key={p} value={p}>
                {priorityLabel[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="task-assignee" className="block text-caption font-semibold">
            Assignee
          </label>
          <select
            id="task-assignee"
            value={value.assigneeId ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value || null }))}
            className="block min-h-touch w-full rounded-control border border-input bg-card px-2"
          >
            <option value="">Not assigned</option>
            {assignable.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="task-due" className="block text-caption font-semibold">
            Due date
          </label>
          <input
            id="task-due"
            type="date"
            value={value.dueDate ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value || null }))}
            className="block min-h-touch w-full rounded-control border border-input bg-card px-2"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="task-description" className="block text-caption font-semibold">
          Description
        </label>
        <textarea
          id="task-description"
          rows={4}
          maxLength={10000}
          value={value.description ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value || null }))}
          className="block w-full rounded-control border border-input px-3 py-2"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-caption text-muted-foreground">
          {task.assignee && <Avatar name={task.assignee.name} />}v{task.version}
        </span>
        <div className="flex gap-2">
          {dirty && !conflict && (
            <Button type="button" variant="secondary" onClick={() => setDraft({})}>
              Cancel
            </Button>
          )}
          {!conflict && (
            <Button
              type="submit"
              disabled={!dirty}
              pending={update.isPending}
              pendingLabel="Saving…"
            >
              Save
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
