import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth } from '@/lib/auth/session';

/** Every page in the signed-in app: guard + shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
