'use client';

import type { ActivityEvent, FieldChange, TaskStatus } from '@taskflow/api-contract';
import { ArrowRight, History } from 'lucide-react';
import { Avatar, StatusBadge } from '@/components/task/task-bits';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { useActivity } from '@/lib/api/queries';
import { priorityLabel } from '@/lib/format';

const fieldLabel: Record<FieldChange['field'], string> = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  assignee: 'assignee',
  dueDate: 'due date',
};

/** Who changed what, when — newest first, grouped by day. */
export function ActivityView({
  projectId,
  onOpenTask,
}: {
  projectId: string;
  onOpenTask: (id: string) => void;
}) {
  const activity = useActivity(projectId);

  if (activity.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading activity" className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-card bg-border/60" />
        ))}
      </div>
    );
  }
  if (activity.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-card border border-border bg-card p-6">
        <p className="font-semibold">We couldn&apos;t load the activity</p>
        <p className="text-muted-foreground">{errorMessage(activity.error)}</p>
        <Button variant="secondary" onClick={() => void activity.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (activity.data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-input bg-card p-10 text-center">
        <History aria-hidden className="size-8 text-muted-foreground" />
        <p className="font-semibold">No activity yet</p>
        <p className="text-muted-foreground">Changes to tasks will show up here.</p>
      </div>
    );
  }

  const groups = groupByDay(activity.data);
  return (
    <div className="max-w-3xl space-y-6">
      {groups.map(([day, events]) => (
        <section key={day} aria-label={day} className="space-y-2">
          <h2 className="text-caption font-semibold text-muted-foreground">{day}</h2>
          <ol className="divide-y divide-border rounded-card border border-border bg-card shadow-xs">
            {events.map((e, i) => (
              <li
                key={e.id}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                className="flex animate-fade-up items-start gap-3 px-4 py-3"
              >
                <Avatar name={e.actor.name} size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p>
                    <span className="font-semibold">{e.actor.name}</span> {verb(e)}{' '}
                    <button
                      type="button"
                      onClick={() => onOpenTask(e.task.id)}
                      className="font-medium text-primary hover:underline"
                    >
                      {e.task.title}
                    </button>
                  </p>
                  {e.changes.map((c) => (
                    <Change key={c.field} change={c} />
                  ))}
                </div>
                <time
                  dateTime={e.createdAt}
                  title={new Date(e.createdAt).toLocaleString('en-US')}
                  className="shrink-0 text-caption text-muted-foreground"
                >
                  {timeLabel(e.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function verb(e: ActivityEvent): string {
  if (e.type === 'task.created') return 'created';
  if (e.type === 'task.moved') return 'moved';
  return `changed ${e.changes.map((c) => fieldLabel[c.field]).join(', ')} on`;
}

function Change({ change }: { change: FieldChange }) {
  if (change.field === 'status') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-caption">
        <StatusBadge status={change.from as TaskStatus} />
        <ArrowRight aria-label="to" className="size-3.5 text-muted-foreground" />
        <StatusBadge status={change.to as TaskStatus} />
      </p>
    );
  }
  if (change.field === 'description') {
    return <p className="text-caption text-muted-foreground">Description updated</p>;
  }
  const show = (v: string | null) =>
    v === null ? 'none' : change.field === 'priority' ? priorityLabel[v as 'low'] : v;
  return (
    <p className="text-caption text-muted-foreground">
      <span className="line-through decoration-muted-foreground/50">{show(change.from)}</span> →{' '}
      <span className="font-medium text-foreground">{show(change.to)}</span>
    </p>
  );
}

function groupByDay(events: ActivityEvent[]): [string, ActivityEvent[]][] {
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const label = dayLabel(e.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  return [...groups];
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "just now", "5 min ago", "3 h ago", then the clock time. */
function timeLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 12 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
