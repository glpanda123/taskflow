'use client';

import {
  priorityValues,
  taskStatusValues,
  type Priority,
  type TaskStatus,
} from '@taskflow/api-contract';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type FormEvent } from 'react';
import { OnboardingShell } from '@/components/layout/onboarding-shell';
import { Button, FormError } from '@/components/ui/button';
import { Field, SelectField } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { useCreateTask } from '@/lib/api/queries';

const statusLabel: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};
const priorityLabel: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export function TaskStep() {
  const router = useRouter();
  const projectId = useSearchParams().get('projectId');

  useEffect(() => {
    if (!projectId) router.replace('/onboarding/workspace');
  }, [projectId, router]);

  if (!projectId) return null;
  return <TaskForm projectId={projectId} />;
}

function TaskForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const createTask = useCreateTask(projectId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get('description')).trim();
    const dueDate = String(form.get('dueDate'));
    createTask.mutate(
      {
        title: String(form.get('title')).trim(),
        status: form.get('status') as TaskStatus,
        priority: form.get('priority') as Priority,
        // Empty inputs mean "not set": send null, not an empty string the API would reject.
        description: description || null,
        dueDate: dueDate || null,
      },
      { onSuccess: () => router.push('/today') },
    );
  }

  const fields = fieldErrors(createTask.error);

  return (
    <OnboardingShell step={3} title="Add your first task">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError
          message={
            createTask.isError && Object.keys(fields).length === 0
              ? errorMessage(createTask.error)
              : null
          }
        />
        <Field
          label="Title"
          name="title"
          required
          maxLength={200}
          placeholder="Write homepage copy"
          error={fields.title}
        />
        <Field
          label="Description"
          name="description"
          optional
          placeholder="Headline and subheadline for the hero section."
          error={fields.description}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Status"
            name="status"
            defaultValue="todo"
            options={taskStatusValues.map((s) => ({ value: s, label: statusLabel[s] }))}
          />
          <SelectField
            label="Priority"
            name="priority"
            defaultValue="medium"
            options={priorityValues.map((p) => ({ value: p, label: priorityLabel[p] }))}
          />
          <Field label="Due date" name="dueDate" type="date" optional error={fields.dueDate} />
        </div>
        <Button
          type="submit"
          className="w-full"
          pending={createTask.isPending}
          pendingLabel="Creating…"
        >
          Create task
        </Button>
      </form>
    </OnboardingShell>
  );
}
