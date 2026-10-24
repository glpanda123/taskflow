'use client';

import { LogOut, Sun, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/brand/logo';
import { Avatar } from '@/components/task/task-bits';
import { useCurrentWorkspace, useProjects } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';
import { roleLabel } from '@/lib/format';
import { projectColor } from '@/lib/project-color';

type NavEntry = { href: string; label: string; icon?: LucideIcon; dot?: string };

/**
 * Signed-in layout.
 * Desktop: full-height sidebar (workspace, navigation, user). Below `md`: a top bar
 * plus a horizontal, scrollable navigation row (works at 375px).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, workspace, role } = useCurrentWorkspace();
  const projects = useProjects(workspace?.id);
  const { logout } = useAuth();
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const projectEntries: NavEntry[] =
    projects.data?.map((p) => ({
      href: `/projects/${p.id}`,
      label: p.name,
      dot: projectColor(p.id).dot,
    })) ?? [];
  const today: NavEntry = { href: '/today', label: 'Today', icon: Sun };
  const members: NavEntry = { href: '/members', label: 'Members', icon: Users };

  const logoutButton = (
    <button
      type="button"
      aria-label="Log out"
      title="Log out"
      onClick={() => void logout()}
      className="inline-flex size-touch shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <LogOut aria-hidden className="size-[18px]" />
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Link href="/today" className="px-5 pt-5 pb-4">
          <Logo />
        </Link>

        {workspace && (
          <div className="mx-3 mb-3 flex items-center gap-3 rounded-card border border-border bg-muted px-3 py-2.5">
            <span
              aria-hidden
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-linear-to-br from-primary to-violet-500 font-semibold text-white"
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{workspace.name}</span>
              <span className="text-caption text-muted-foreground">
                {roleLabel[workspace.role]}
              </span>
            </span>
          </div>
        )}

        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          <SideLink entry={today} active={isActive(today.href)} />
          <SectionLabel>Projects</SectionLabel>
          {projectEntries.map((e) => (
            <SideLink key={e.href} entry={e} active={isActive(e.href)} />
          ))}
          {role !== 'viewer' && (
            <>
              <SectionLabel>Workspace</SectionLabel>
              <SideLink entry={members} active={isActive(members.href)} />
            </>
          )}
        </nav>

        {me && (
          <div className="flex items-center gap-3 border-t border-border px-4 py-3">
            <Avatar name={me.user.name} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption font-semibold">{me.user.name}</span>
              <span className="block truncate text-caption text-muted-foreground">
                {me.user.email}
              </span>
            </span>
            {logoutButton}
          </div>
        )}
      </aside>

      {/* Mobile top bar + navigation */}
      <div className="border-b border-border bg-card md:hidden">
        <header className="flex items-center justify-between gap-3 px-4 py-2">
          <Link href="/today" className="flex min-w-0 items-center gap-2">
            <LogoMark className="size-7" />
            <span className="truncate font-semibold">{workspace?.name ?? 'TaskFlow'}</span>
          </Link>
          <div className="flex items-center gap-1">
            {me && <Avatar name={me.user.name} />}
            {logoutButton}
          </div>
        </header>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {[today, ...projectEntries, ...(role !== 'viewer' ? [members] : [])].map((e) => (
            <TopLink key={e.href} entry={e} active={isActive(e.href)} />
          ))}
        </nav>
      </div>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function EntryIcon({ entry }: { entry: NavEntry }) {
  if (entry.icon) {
    const Icon = entry.icon;
    return <Icon aria-hidden className="size-[18px] shrink-0" />;
  }
  return (
    <span aria-hidden className="flex size-[18px] shrink-0 items-center justify-center">
      <span className={`size-2.5 rounded-[3px] ${entry.dot}`} />
    </span>
  );
}

function SideLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-2.5 rounded-control px-3 py-2 transition-colors ${active ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground/80 hover:bg-muted hover:text-foreground'}`}
    >
      {active && (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-pill bg-primary" />
      )}
      <EntryIcon entry={entry} />
      <span className="truncate">{entry.label}</span>
    </Link>
  );
}

function TopLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-touch shrink-0 items-center gap-2 rounded-pill px-3 whitespace-nowrap ${active ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-muted'}`}
    >
      <EntryIcon entry={entry} />
      {entry.label}
    </Link>
  );
}
