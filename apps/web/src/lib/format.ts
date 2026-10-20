import type { Priority, Role, TaskStatus } from '@taskflow/api-contract';

export const statusLabel: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

export const priorityLabel: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

/** Today's date as YYYY-MM-DD in the user's time zone (due dates are plain dates). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export type DueInfo = { label: string; tone: 'late' | 'soon' | 'normal' | 'none' };

/** "2 days late · Oct 13", "Due today", "Due tomorrow", "Fri, Oct 16", "No date". */
export function dueInfo(dueDate: string | null, status: TaskStatus): DueInfo {
  if (!dueDate) return { label: 'No date', tone: 'none' };
  if (status === 'done') return { label: shortDate(dueDate), tone: 'normal' };
  const diff = daysBetween(todayIso(), dueDate);
  if (diff < 0) {
    const n = -diff;
    return { label: `${n} day${n === 1 ? '' : 's'} late · ${shortDate(dueDate)}`, tone: 'late' };
  }
  if (diff === 0) return { label: 'Due today', tone: 'soon' };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'soon' };
  return { label: shortDate(dueDate), tone: diff <= 3 ? 'soon' : 'normal' };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
