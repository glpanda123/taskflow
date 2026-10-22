'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type FormEvent } from 'react';
import { OnboardingShell } from '@/components/layout/onboarding-shell';
import { Button, FormError } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { useCreateProject } from '@/lib/api/queries';

export function ProjectStep() {
  const router = useRouter();
  const workspaceId = useSearchParams().get('workspaceId');

  // Landed here without a workspace (e.g. a bookmarked URL) → back to step 1.
  useEffect(() => {
    if (!workspaceId) router.replace('/onboarding/workspace');
  }, [workspaceId, router]);

  if (!workspaceId) return null;
  return <ProjectForm workspaceId={workspaceId} />;
}

function ProjectForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const createProject = useCreateProject(workspaceId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    createProject.mutate(
      { name },
      { onSuccess: (project) => router.push(`/onboarding/task?projectId=${project.id}`) },
    );
  }

  const fields = fieldErrors(createProject.error);

  return (
    <OnboardingShell
      step={2}
      title="Start your first project"
      subtitle="A project groups related tasks, like a launch, a client or a sprint of work."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError
          message={createProject.isError && !fields.name ? errorMessage(createProject.error) : null}
        />
        <Field
          label="Project name"
          name="name"
          required
          maxLength={80}
          placeholder="Landing page launch"
          error={fields.name}
        />
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Back
          </Button>
          <Button
            type="submit"
            className="flex-1"
            pending={createProject.isPending}
            pendingLabel="Creating…"
          >
            Create project and add a task
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}
