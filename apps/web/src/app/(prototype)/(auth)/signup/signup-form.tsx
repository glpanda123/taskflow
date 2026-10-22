'use client';

import type { RegisterRequest } from '@taskflow/api-contract';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { Button, FormError } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage, fieldErrors } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/session';

/** Must match `RegisterRequest.password.minLength` in openapi.yaml. */
const MIN_PASSWORD = 8;

export function SignupForm() {
  const { register } = useAuth();
  const router = useRouter();

  const submit = useMutation({
    mutationFn: (body: RegisterRequest) => register(body),
    onSuccess: () => router.push('/onboarding/workspace'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submit.mutate({
      name: String(form.get('name')).trim(),
      email: String(form.get('email')).trim(),
      password: String(form.get('password')),
    });
  }

  const emailTaken = submit.error instanceof ApiError && submit.error.status === 409;
  const fields = fieldErrors(submit.error);
  const formError =
    submit.isError && !emailTaken && Object.keys(fields).length === 0
      ? errorMessage(submit.error)
      : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={formError} />
      <Field label="Your name" name="name" autoComplete="name" required error={fields.name} />
      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={emailTaken ? 'This email is already registered.' : fields.email}
      />
      {emailTaken && (
        <p className="-mt-2 text-caption">
          <Link href="/login" className="font-medium text-primary underline">
            Log in instead
          </Link>
        </p>
      )}
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD}
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={fields.password}
      />
      <Button
        type="submit"
        className="w-full"
        pending={submit.isPending}
        pendingLabel="Creating account…"
      >
        Create account
      </Button>
    </form>
  );
}
