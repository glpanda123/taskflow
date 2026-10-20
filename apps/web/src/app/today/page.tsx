'use client';

/**
 * Placeholder landing page after login/onboarding, replaced by the real Today screen next.
 * Shows the user's workspace, its projects and their tasks, so the onboarding result is visible.
 */
import type { Project } from '@taskflow/api-contract';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { useMe, useProjects, useTasks } from '@/lib/api/queries';
import { RequireAuth, useAuth } from '@/lib/auth/session';

export default function TodayPage() {
  return (
    <RequireAuth>
      <TodayPlaceholder />
    </RequireAuth>
  );
}

function TodayPlaceholder() {
  const me = useMe();
  const { logout } = useAuth();
  const workspace = me.data?.workspaces[0];
  const projects = useProjects(workspace?.id);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-caption text-muted-foreground">
            {workspace ? `${workspace.name} · ${workspace.role}` : 'No workspace yet'}
          </p>
          <h1 className="text-title font-semibold">
            Hi {me.data?.user.name.split(' ')[0] ?? ''} 👋
          </h1>
          <p className="text-muted-foreground">The real Today overview lands in the next step.</p>
        </div>
        <Button variant="secondary" onClick={() => void logout()}>
          Log out
        </Button>
      </header>

      {projects.isPending && workspace && (
        <p className="text-muted-foreground">Loading projects…</p>
      )}
      {projects.isError && (
        <p className="text-status-overdue-text">{errorMessage(projects.error)}</p>
      )}
      {projects.data?.map((project) => (
        <ProjectTasks key={project.id} project={project} />
      ))}

      <Link href="/dev" className="inline-block text-primary underline">
        Open the 409 playground
      </Link>
    </main>
  );
}

function ProjectTasks({ project }: { project: Project }) {
  const tasks = useTasks(project.id);
  return (
    <section className="space-y-2 rounded-card border border-border bg-card p-4">
      <h2 className="text-section font-semibold">{project.name}</h2>
      {tasks.isPending ? (
        <p className="text-caption text-muted-foreground">Loading…</p>
      ) : tasks.data?.length ? (
        <ul className="space-y-1">
          {tasks.data.map((t) => (
            <li key={t.id} className="flex justify-between gap-3">
              <span>{t.title}</span>
              <span className="text-caption text-muted-foreground">{t.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">No tasks yet.</p>
      )}
    </section>
  );
}
