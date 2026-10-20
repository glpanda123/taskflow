'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/task/task-bits';
import { useCurrentWorkspace, useProjects } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';
import { roleLabel } from '@/lib/format';

/**
 * Signed-in layout: top bar (workspace, user, log out) + navigation.
 * Desktop: left sidebar. Below `md`: the nav becomes a horizontal, scrollable row.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, workspace, role } = useCurrentWorkspace();
  const projects = useProjects(workspace?.id);
  const { logout } = useAuth();
  const pathname = usePathname();

  const navItem = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-touch shrink-0 items-center rounded-control px-3 whitespace-nowrap md:min-h-0 md:py-2 ${active ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-muted'}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/today" className="text-section font-semibold">
            TaskFlow
          </Link>
          {workspace && (
            <span className="truncate text-caption text-muted-foreground">
              {workspace.name} · {roleLabel[workspace.role]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {me && (
            <span className="flex items-center gap-2 text-caption">
              <Avatar name={me.user.name} />
              <span className="hidden sm:inline">{me.user.name}</span>
            </span>
          )}
          <button
            type="button"
            className="min-h-touch text-caption underline"
            onClick={() => void logout()}
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <nav
          aria-label="Main"
          className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1 md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-3 md:py-4"
        >
          {navItem('/today', 'Today')}
          <p className="hidden px-3 pt-4 pb-1 text-caption font-semibold text-muted-foreground uppercase md:block">
            Projects
          </p>
          {projects.data?.map((p) => navItem(`/projects/${p.id}`, p.name))}
          {role !== 'viewer' && navItem('/members', 'Members')}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
