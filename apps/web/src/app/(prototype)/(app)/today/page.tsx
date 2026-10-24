'use client';

/**
 * Today: what's late, what's due soon, and the team's numbers at a glance.
 * Viewers see the same overview for the projects they were invited to (the API filters).
 */
import type { Project, Task } from '@taskflow/api-contract';
import {
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Timer,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Avatar, DueLabel, StatusBadge } from '@/components/task/task-bits';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { useCurrentWorkspace, useProjects, useToday } from '@/lib/api/queries';
import { todayIso } from '@/lib/format';
import { projectColor } from '@/lib/project-color';

type Counts = {
  overdue: number;
  dueSoon: number;
  inProgress: number;
  unassigned: number;
  doneThisWeek: number;
};

type Tone = 'danger' | 'warn' | 'primary' | 'muted' | 'success';

const stats: { key: keyof Counts; label: string; icon: LucideIcon; tone: Tone }[] = [
  { key: 'overdue', label: 'Late', icon: TriangleAlert, tone: 'danger' },
  { key: 'dueSoon', label: 'Due in 7 days', icon: CalendarClock, tone: 'warn' },
  { key: 'inProgress', label: 'In progress', icon: Timer, tone: 'primary' },
  { key: 'unassigned', label: 'Not assigned', icon: UserX, tone: 'muted' },
  { key: 'doneThisWeek', label: 'Done this week', icon: CircleCheck, tone: 'success' },
];

const toneBubble: Record<Tone, string> = {
  danger: 'bg-status-overdue-subtle text-status-overdue-text',
  warn: 'bg-amber-50 text-amber-700',
  primary: 'bg-accent text-accent-foreground',
  muted: 'bg-muted text-muted-foreground ring-1 ring-border',
  success: 'bg-emerald-50 text-status-done',
};

/** "2 tasks are late and 5 are due in the next 7 days." */
function summary({ overdue, dueSoon }: Counts): string {
  const tasks = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`;
  const are = (n: number) => (n === 1 ? 'is' : 'are');
  if (overdue && dueSoon)
    return `${tasks(overdue)} ${are(overdue)} late and ${dueSoon} ${are(dueSoon)} due in the next 7 days.`;
  if (overdue) return `${tasks(overdue)} ${are(overdue)} late.`;
  if (dueSoon) return `${tasks(dueSoon)} ${are(dueSoon)} due in the next 7 days.`;
  return 'Nothing is late or due this week.';
}

export default function TodayPage() {
  const { data: me, workspace } = useCurrentWorkspace();
  const today = useToday(workspace?.id);
  const projects = useProjects(workspace?.id);
  const projectById = new Map(projects.data?.map((p) => [p.id, p]));

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const firstName = me?.user.name.split(' ')[0];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="animate-fade-up space-y-1">
        <p className="text-caption font-medium text-muted-foreground">{dateLabel}</p>
        <h1 className="text-title font-semibold">
          {firstName ? `Good to see you, ${firstName}` : 'Today'}
        </h1>
        {today.data && <p className="text-muted-foreground">{summary(today.data.counts)}</p>}
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
          <section
            aria-label="Summary"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {stats.map((s, i) => (
              <Stat
                key={s.key}
                label={s.label}
                icon={s.icon}
                tone={s.tone}
                value={today.data.counts[s.key]}
                index={i}
              />
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section
              aria-labelledby="due-heading"
              className="animate-fade-up rounded-card border border-border bg-card shadow-xs [animation-delay:150ms]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
                <h2 id="due-heading" className="text-section font-semibold">
                  Late or due soon
                </h2>
                <span className="rounded-pill bg-muted px-2.5 py-0.5 text-caption text-muted-foreground ring-1 ring-border">
                  {today.data.overdue.length + today.data.dueSoon.length}
                </span>
              </div>
              {today.data.overdue.length + today.data.dueSoon.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                  <CircleCheck aria-hidden className="size-10 text-status-done" />
                  <p className="font-semibold">You&apos;re all clear</p>
                  <p className="text-muted-foreground">
                    Nothing is late or due in the next 7 days.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {[...today.data.overdue, ...today.data.dueSoon].map((task, i) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={projectById.get(task.projectId)}
                      index={i}
                    />
                  ))}
                </ul>
              )}
            </section>

            <ProjectsAtRisk
              tasks={[...today.data.overdue, ...today.data.dueSoon]}
              projects={projects.data ?? []}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
  index: number;
}) {
  const alarming = tone === 'danger' && value > 0;
  return (
    <div
      style={{ animationDelay: `${index * 50}ms` }}
      className={`animate-fade-up rounded-card border bg-card p-4 shadow-xs ${index === stats.length - 1 ? 'col-span-2 sm:col-span-1' : ''} ${alarming ? 'border-status-overdue/50' : 'border-border'}`}
    >
      <span
        aria-hidden
        className={`inline-flex size-9 items-center justify-center rounded-control ${toneBubble[tone]}`}
      >
        <Icon className="size-[18px]" />
      </span>
      <p
        className={`mt-3 text-title font-semibold tabular-nums ${alarming ? 'text-status-overdue-text' : ''}`}
      >
        {value}
      </p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}

function TaskRow({
  task,
  project,
  index,
}: {
  task: Task;
  project: Project | undefined;
  index: number;
}) {
  const color = projectColor(task.projectId);
  return (
    <li
      style={{ animationDelay: `${200 + Math.min(index, 10) * 40}ms` }}
      className="animate-fade-up"
    >
      <Link
        href={`/projects/${task.projectId}?task=${task.id}`}
        className="group flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-muted md:px-5"
      >
        <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <span className="block truncate font-medium group-hover:text-primary">{task.title}</span>
          <span
            className={`mt-0.5 inline-flex items-center gap-1.5 rounded-pill px-2 py-px text-[12px] ${color.soft}`}
          >
            <span aria-hidden className={`size-1.5 rounded-pill ${color.dot}`} />
            {project?.name ?? 'Project'}
          </span>
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
        <ChevronRight
          aria-hidden
          className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
        />
      </Link>
    </li>
  );
}

/** Late and due-soon work grouped by project: where to look first. */
function ProjectsAtRisk({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const rows = projects
    .map((p) => {
      const mine = tasks.filter((t) => t.projectId === p.id);
      return {
        project: p,
        late: mine.filter(isLate).length,
        soon: mine.filter((t) => !isLate(t)).length,
      };
    })
    .filter((r) => r.late + r.soon > 0)
    .sort((a, b) => b.late - a.late || b.soon - a.soon);

  return (
    <section
      aria-labelledby="risk-heading"
      className="animate-fade-up space-y-3 self-start rounded-card border border-border bg-card p-4 shadow-xs [animation-delay:250ms] md:p-5"
    >
      <h2 id="risk-heading" className="text-section font-semibold">
        Projects to watch
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Every project is on track.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ project, late, soon }) => {
            const color = projectColor(project.id);
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-muted"
                >
                  <span aria-hidden className={`h-8 w-1 rounded-pill ${color.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{project.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {late > 0 && <span className="text-status-overdue-text">{late} late</span>}
                      {late > 0 && soon > 0 && ' · '}
                      {soon > 0 && `${soon} due soon`}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function isLate(task: Task): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < todayIso();
}

/** Same shape as the loaded page, so nothing jumps when data arrives. */
function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading today's overview" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-card bg-border/60" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="h-80 animate-pulse rounded-card bg-border/60" />
        <div className="h-48 animate-pulse rounded-card bg-border/60" />
      </div>
    </div>
  );
}
