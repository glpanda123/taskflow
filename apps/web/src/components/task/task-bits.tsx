import type { TaskStatus } from '@taskflow/api-contract';
import { dueInfo, initials, statusLabel } from '@/lib/format';

const statusDot: Record<TaskStatus, string> = {
  todo: 'bg-status-todo',
  in_progress: 'bg-status-in-progress',
  in_review: 'bg-status-in-review',
  done: 'bg-status-done',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption">
      <span aria-hidden className={`size-2 rounded-pill ${statusDot[status]}`} />
      {statusLabel[status]}
    </span>
  );
}

/** Late dates use the overdue colour AND the word "late" — never colour alone (WCAG 1.4.1). */
export function DueLabel({ dueDate, status }: { dueDate: string | null; status: TaskStatus }) {
  const { label, tone } = dueInfo(dueDate, status);
  const style =
    tone === 'late'
      ? 'rounded-pill bg-status-overdue-subtle px-2 py-0.5 font-medium text-status-overdue-text'
      : tone === 'none'
        ? 'text-muted-foreground'
        : '';
  return <span className={`text-caption whitespace-nowrap ${style}`}>{label}</span>;
}

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-pill bg-accent font-semibold text-accent-foreground ${size === 'sm' ? 'size-6 text-[11px]' : 'size-8 text-caption'}`}
    >
      {initials(name)}
    </span>
  );
}
