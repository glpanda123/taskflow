'use client';

import type { ReactNode } from 'react';
import { useMe } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';

/** Header with "Signed in as …", the step counter and a centred card, as in the mockup. */
export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const me = useMe();
  const { logout } = useAuth();

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-3 md:px-8">
        <span className="text-section font-semibold">TaskFlow</span>
        <div className="flex items-center gap-3 text-caption text-muted-foreground">
          {me.data && <span className="hidden sm:inline">Signed in as {me.data.user.email}</span>}
          <button type="button" className="underline" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <div className="space-y-6 rounded-card border border-border bg-card p-6 md:p-8">
          <header className="space-y-1">
            <p className="text-caption font-medium text-muted-foreground">
              Step {step} of 3{step === 3 ? ' · last step' : ''}
            </p>
            <h1 className="text-title font-semibold">{title}</h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
