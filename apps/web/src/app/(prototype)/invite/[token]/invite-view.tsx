'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/brand/logo';
import { Button, FormError } from '@/components/ui/button';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { preferWorkspace, useAcceptInvitation, useInvitation, useMe } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';
import { roleLabel } from '@/lib/format';
import { forgetInvite, pendingInvite, rememberInvite } from '@/lib/invite/pending';

/**
 * Where an invitation link lands. It works in three states: no account yet (sign up
 * or log in, then come back), logged in with the invited email (join), and logged in
 * as someone else (the server refuses; offer to switch account).
 */
export function InviteView() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { status, logout } = useAuth();
  const invitation = useInvitation(token);
  const me = useMe(status === 'authenticated');
  const accept = useAcceptInvitation(token);

  // Remember the invitation, so sign-up and log-in return here instead of onboarding.
  const invitedEmail = invitation.data?.email;
  useEffect(() => {
    if (invitedEmail) rememberInvite({ token, email: invitedEmail });
  }, [token, invitedEmail]);

  // A link that can no longer be used must not stay remembered: log-in would keep
  // sending the person back here instead of into the app.
  const unusable = invitation.error instanceof ApiError && invitation.error.status === 404;
  useEffect(() => {
    if (unusable && pendingInvite()?.token === token) forgetInvite();
  }, [token, unusable]);

  function join() {
    accept.mutate(undefined, {
      onSuccess: (workspace) => {
        forgetInvite();
        // Someone who already has a workspace must land in the one they just joined.
        preferWorkspace(workspace.id);
        router.push('/today');
      },
    });
  }

  const wrongAccount = accept.error instanceof ApiError && accept.error.status === 403;
  const alreadyMember = accept.error instanceof ApiError && accept.error.status === 409;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="w-fit">
        <Logo />
      </Link>

      {invitation.isPending ? (
        <p className="text-muted-foreground">Checking the invitation…</p>
      ) : invitation.isError ? (
        <section className="space-y-2">
          <h1 className="text-title font-semibold">This invitation can&apos;t be used</h1>
          <p className="text-muted-foreground">
            The link is wrong, has expired (invitations last 7 days) or was already used. Ask the
            person who invited you for a new one.
          </p>
          <Link href="/today" className="font-medium text-primary underline">
            {status === 'authenticated' ? 'Open TaskFlow' : 'Go to log in'}
          </Link>
        </section>
      ) : (
        <section className="space-y-5 rounded-card border border-border bg-card p-5">
          <div className="space-y-1">
            <h1 className="text-title font-semibold">
              Join {invitation.data.workspaceName} on TaskFlow
            </h1>
            <p className="text-muted-foreground">
              You were invited as{' '}
              <span className="font-medium text-foreground">{roleLabel[invitation.data.role]}</span>
              . The invitation is for{' '}
              <span className="font-medium text-foreground">{invitation.data.email}</span>.
            </p>
          </div>

          {status === 'loading' ? null : status === 'anonymous' ? (
            <div className="space-y-3">
              <p className="text-caption text-muted-foreground">
                Create an account with that email, or log in if you already have one. You will come
                back here to join.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/signup"
                  className="inline-flex min-h-touch items-center justify-center rounded-control bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-touch items-center justify-center rounded-control border border-input bg-card px-4 font-medium hover:bg-accent"
                >
                  Log in
                </Link>
              </div>
            </div>
          ) : wrongAccount ? (
            <div className="space-y-3">
              <p role="alert" className="text-status-overdue-text">
                You are logged in as {me.data?.user.email ?? 'another account'}, but this invitation
                is for {invitation.data.email}.
              </p>
              <Button type="button" variant="secondary" onClick={() => void logout()}>
                Log out and use the invited email
              </Button>
            </div>
          ) : alreadyMember ? (
            <div className="space-y-3">
              <p>You are already a member of this workspace.</p>
              <Link href="/today" className="font-medium text-primary underline">
                Open TaskFlow
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <FormError message={accept.isError ? errorMessage(accept.error) : null} />
              <Button
                type="button"
                onClick={join}
                pending={accept.isPending}
                pendingLabel="Joining…"
              >
                Join {invitation.data.workspaceName}
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
