'use client';

/**
 * Today: what's late, what's due soon, and the team's numbers at a glance.
 * Viewers see the same overview for the projects they were invited to (the API filters).
 */
import type { Task } from '@taskflow/api-contract';
import Link from 'next/link';
import { Avatar, DueLabel, StatusBadge } from '@/components/task/task-bits';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { useCurrentWorkspace, useProjects, useToday } from '@/lib/api/queries';

export default function TodayPage() {
  const { data: me, workspace } = useCurrentWorkspace();
  const today = useToday(workspace?.id);
  const projects = useProjects(workspace?.id);
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? '';

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const firstName = me?.user.name.split(' ')[0];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <header className="space-y-1">
        <p className="text-caption text-muted-foreground">{dateLabel}</p>
        <h1 className="text-title font-semibold">
          {firstName ? `Good to see you, ${firstName}` : 'Today'}
        </h1>
      </header>

      {today.isPending ? (
        <TodaySkeleton />
      ) : today.isError ? (
        <div
          role="alert"
          className="space-y-3 rounded-card border border-border bg-card p-6 text-center"
        >
          <p className="font-semibold">We couldn&apos;t load today&apos;s overview</p>
          <p className="text-muted-foreground">{errorMessage(today.error)}</p>
          <Button variant="secondary" onClick={() => void today.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Late" value={today.data.counts.overdue} danger />
            <Stat label="Due in 7 days" value={today.data.counts.dueSoon} />
            <Stat label="In progress" value={today.data.counts.inProgress} />
            <Stat label="Not assigned" value={today.data.counts.unassigned} />
            <Stat label="Done" value={today.data.counts.doneThisWeek} />
          </section>

          <section className="space-y-3 rounded-card border border-border bg-card p-4 md:p-6">
            <h2 className="text-section font-semibold">Late or due soon</h2>
            {today.data.overdue.length + today.data.dueSoon.length === 0 ? (
              <p className="text-muted-foreground">Nothing is late or due in the next 7 days. 🎉</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...today.data.overdue, ...today.data.dueSoon].map((task) => (
                  <TaskRow key={task.id} task={task} projectName={projectName(task.projectId)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div
      className={`rounded-card border p-4 ${danger && value > 0 ? 'border-status-overdue bg-status-overdue-subtle' : 'border-border bg-card'}`}
    >
      <p
        className={`text-title font-semibold ${danger && value > 0 ? 'text-status-overdue-text' : ''}`}
      >
        {value}
      </p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}

function TaskRow({ task, projectName }: { task: Task; projectName: string }) {
  return (
    <li>
      <Link
        href={`/projects/${task.projectId}?task=${task.id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-muted"
      >
        <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <span className="block truncate font-medium">{task.title}</span>
          <span className="text-caption text-muted-foreground">{projectName}</span>
        </span>
        <StatusBadge status={task.status} />
        <span className="flex items-center gap-2 text-caption">
          {task.assignee ? (
            <>
              <Avatar name={task.assignee.name} />
              {task.assignee.name}
            </>
          ) : (
            <span className="text-muted-foreground">Not assigned</span>
          )}
        </span>
        <DueLabel dueDate={task.dueDate} status={task.status} />
      </Link>
    </li>
  );
}

/** Same shape as the loaded page, so nothing jumps when data arrives. */
function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading today's overview" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[86px] animate-pulse rounded-card bg-border/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card bg-border/60" />
    </div>
  );
}
