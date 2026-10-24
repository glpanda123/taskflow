'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { Button, FormError } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage, fieldErrors } from '@/lib/api/errors';
import { meQuery } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';
import { demoAccount } from '@/lib/demo';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      await login(body);
      // Where to go depends on whether this user already has a workspace.
      return queryClient.fetchQuery(meQuery);
    },
    onSuccess: (me) => router.push(me.workspaces.length > 0 ? '/today' : '/onboarding/workspace'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submit.mutate({ email: String(form.get('email')), password: String(form.get('password')) });
  }

  const fields = fieldErrors(submit.error);
  const formError =
    submit.error instanceof ApiError && submit.error.status === 401
      ? 'Wrong email or password.'
      : submit.isError && Object.keys(fields).length === 0
        ? errorMessage(submit.error)
        : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={formError} />
      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fields.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fields.password}
      />
      <Button
        type="submit"
        className="w-full"
        pending={submit.isPending}
        pendingLabel="Logging in…"
      >
        Log in
      </Button>

      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full gap-2"
        disabled={submit.isPending}
        onClick={() => submit.mutate(demoAccount)}
      >
        <Sparkles aria-hidden className="size-4 text-primary" />
        Explore the demo studio
      </Button>

      <p className="rounded-control bg-muted px-3 py-2 text-caption text-muted-foreground">
        Prototype accounts (password <code>password123</code>): <code>ly@taskflow.dev</code>{' '}
        (owner), <code>minh@taskflow.dev</code> (member), <code>viewer@client.dev</code> (viewer).
      </p>
    </form>
  );
}
