'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { OnboardingShell } from '@/components/layout/onboarding-shell';
import { Button, FormError } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { useCreateWorkspace } from '@/lib/api/queries';

export default function OnboardingWorkspacePage() {
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    createWorkspace.mutate(
      { name },
      { onSuccess: (workspace) => router.push(`/onboarding/project?workspaceId=${workspace.id}`) },
    );
  }

  const fields = fieldErrors(createWorkspace.error);

  return (
    <OnboardingShell step={1} title="Create your workspace">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError
          message={
            createWorkspace.isError && !fields.name ? errorMessage(createWorkspace.error) : null
          }
        />
        <Field
          label="Workspace name"
          name="name"
          required
          maxLength={80}
          placeholder="Acme Studio"
          hint="Usually your company or team name."
          error={fields.name}
        />
        <Button
          type="submit"
          className="w-full"
          pending={createWorkspace.isPending}
          pendingLabel="Creating…"
        >
          Continue
        </Button>
        <p className="text-caption text-muted-foreground">
          You&apos;ll be the owner. You can rename the workspace later.
        </p>
      </form>
    </OnboardingShell>
  );
}
