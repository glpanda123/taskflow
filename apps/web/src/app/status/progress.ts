/** Shape of `src/content/progress.json` and the numbers the status page derives from it. */

export type ChecklistItem = { label: string; done: boolean };

export type Stage = {
  id: string;
  name: string;
  dates: string;
  /** Share of the whole project, in percent. Weights add up to 100. */
  weight: number;
  summary: string;
  gate?: string;
  items: ChecklistItem[];
};

export type DayStatus = 'shipped' | 'in_progress' | 'rest' | 'planned';

export type Progress = {
  updatedAt: string;
  title: string;
  tagline: string;
  startDate: string;
  endDate: string;
  currentStageId: string;
  today: { date: string; focus: string; items: ChecklistItem[] };
  stages: Stage[];
  days: { date: string; status: DayStatus; summary: string }[];
  log: { date: string; title: string; body: string }[];
  links: { label: string; href: string }[];
};

export type StageState = 'done' | 'current' | 'planned';

/** Percent of a stage's checklist that is done. */
export function stageProgress(stage: Stage): number {
  if (stage.items.length === 0) return 0;
  return Math.round((stage.items.filter((i) => i.done).length / stage.items.length) * 100);
}

/** Weighted average of all stages. */
export function overallProgress(stages: Stage[]): number {
  const total = stages.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return 0;
  return Math.round(stages.reduce((sum, s) => sum + s.weight * stageProgress(s), 0) / total);
}

export function stageState(stage: Stage, currentStageId: string): StageState {
  if (stageProgress(stage) === 100) return 'done';
  return stage.id === currentStageId ? 'current' : 'planned';
}

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** 1-based day count from the start date. */
export function dayNumber(startIso: string, iso: string): number {
  return Math.round((toUtc(iso) - toUtc(startIso)) / DAY_MS) + 1;
}

/** One entry per calendar day from start to end. Days without a log entry are planned (future) or rest (past). */
export function buildTimeline(p: Progress): Progress['days'] {
  const byDate = new Map(p.days.map((d) => [d.date, d]));
  const out: Progress['days'] = [];
  for (let t = toUtc(p.startDate); t <= toUtc(p.endDate); t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(
      byDate.get(date) ??
        (date > p.today.date
          ? { date, status: 'planned', summary: 'Planned' }
          : { date, status: 'rest', summary: 'No session' }),
    );
  }
  return out;
}

/** "Oct 22" or "Thu, Oct 22". Dates are plain calendar dates, so format in UTC to avoid shifting a day. */
export function formatDate(iso: string, opts: { weekday?: boolean } = {}): string {
  return new Date(toUtc(iso)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(opts.weekday ? { weekday: 'short' } : {}),
  });
}
