import type { Metadata } from 'next';
import Link from 'next/link';
import data from '@/content/progress.json';
import {
  buildTimeline,
  dayNumber,
  formatDate,
  overallProgress,
  stageProgress,
  stageState,
  type Progress,
  type StageState,
} from './progress';

// The JSON is edited by hand at the end of each session; the types document its shape.
const progress = data as Progress;

export const metadata: Metadata = {
  title: 'Build status · TaskFlow',
  description: progress.tagline,
  openGraph: { title: 'TaskFlow build status', description: progress.tagline },
};

const stateLabel: Record<StageState, string> = {
  done: 'Done',
  current: 'In progress',
  planned: 'Planned',
};

const stateClass: Record<StageState, string> = {
  done: 'bg-status-done/10 text-status-done',
  current: 'bg-accent text-accent-foreground',
  planned: 'bg-muted text-muted-foreground border border-border',
};

export default function StatusPage() {
  const overall = overallProgress(progress.stages);
  const currentIndex = progress.stages.findIndex((s) => s.id === progress.currentStageId);
  const current = progress.stages[currentIndex];
  const timeline = buildTimeline(progress);
  const day = dayNumber(progress.startDate, progress.today.date);

  return (
    <div className="flex-1">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
          <Link href="/status" className="flex items-center gap-2 font-semibold">
            <span
              aria-hidden
              className="inline-flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground"
            >
              T
            </span>
            TaskFlow <span className="font-normal text-muted-foreground">Status</span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-touch items-center rounded-control bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Open the prototype
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 md:px-8">
        {/* Overall: the equivalent of "All systems operational". */}
        <section
          aria-labelledby="overall-heading"
          className="overflow-hidden rounded-card border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 bg-primary px-5 py-4 text-primary-foreground md:px-6">
            <div>
              <p className="text-caption opacity-80">
                Stage {currentIndex} of {progress.stages.length - 1} · Day {day}
              </p>
              <h1 id="overall-heading" className="text-section font-semibold">
                {current ? `In progress: ${current.name}` : 'Not started'}
              </h1>
            </div>
            <p className="text-title font-semibold tabular-nums">{overall}%</p>
          </div>
          <div className="space-y-3 px-5 py-4 md:px-6">
            <ProgressBar value={overall} label="Overall progress" />
            <p className="text-muted-foreground">{progress.tagline}</p>
            <p className="text-caption text-muted-foreground">
              Updated {formatDate(progress.updatedAt, { weekday: true })}
            </p>
          </div>
        </section>

        {/* Daily activity: one bar per day, like an uptime strip. */}
        <section aria-labelledby="days-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="days-heading" className="text-section font-semibold">
              Daily activity
            </h2>
            <Legend />
          </div>
          <div className="rounded-card border border-border bg-card p-4 md:p-5">
            <ol className="flex h-10 gap-[3px]">
              {timeline.map((d) => (
                <li
                  key={d.date}
                  title={`${formatDate(d.date)} — ${d.summary}`}
                  className={`flex-1 rounded-[3px] ${dayClass[d.status]}`}
                >
                  <span className="sr-only">
                    {formatDate(d.date)}: {dayLabel[d.status]}. {d.summary}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex justify-between text-caption text-muted-foreground">
              <span>{formatDate(progress.startDate)}</span>
              <span>{formatDate(progress.endDate)}</span>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Stages: the equivalent of the component list. */}
          <section aria-labelledby="stages-heading" className="space-y-3">
            <h2 id="stages-heading" className="text-section font-semibold">
              Stages
            </h2>
            <ul className="divide-y divide-border rounded-card border border-border bg-card">
              {progress.stages.map((stage, i) => {
                const state = stageState(stage, progress.currentStageId);
                const pct = stageProgress(stage);
                return (
                  <li key={stage.id}>
                    <details open={state === 'current'} className="group">
                      <summary className="flex min-h-touch cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-5">
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            aria-hidden
                            className="text-muted-foreground transition-transform group-open:rotate-90"
                          >
                            ›
                          </span>
                          <span className="font-semibold">
                            {i}. {stage.name}
                          </span>
                          <span className="text-caption text-muted-foreground">{stage.dates}</span>
                        </span>
                        <span
                          className={`rounded-pill px-2.5 py-0.5 text-caption font-medium ${stateClass[state]}`}
                        >
                          {stateLabel[state]}
                        </span>
                        <span className="w-10 text-right text-caption tabular-nums">{pct}%</span>
                        <span className="basis-full">
                          <ProgressBar value={pct} label={`${stage.name} progress`} thin />
                        </span>
                      </summary>
                      <div className="space-y-3 px-4 pb-4 md:px-5">
                        <p className="text-muted-foreground">{stage.summary}</p>
                        <Checklist items={stage.items} />
                        {stage.gate && (
                          <p className="text-caption">
                            <span className="font-semibold">Gate:</span> {stage.gate}
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside className="space-y-8">
            <section aria-labelledby="today-heading" className="space-y-3">
              <h2 id="today-heading" className="text-section font-semibold">
                Today
              </h2>
              <div className="space-y-3 rounded-card border border-primary/30 bg-card p-4">
                <p className="text-caption text-muted-foreground">
                  {formatDate(progress.today.date, { weekday: true })}
                </p>
                <p className="font-semibold">{progress.today.focus}</p>
                <Checklist items={progress.today.items} />
              </div>
            </section>

            <section aria-labelledby="links-heading" className="space-y-3">
              <h2 id="links-heading" className="text-section font-semibold">
                Links
              </h2>
              <ul className="space-y-1">
                {progress.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="inline-flex min-h-touch items-center text-primary hover:underline"
                    >
                      {l.label} →
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>

        {/* Updates: the equivalent of past incidents. */}
        <section aria-labelledby="log-heading" className="space-y-3">
          <h2 id="log-heading" className="text-section font-semibold">
            Updates
          </h2>
          <ol className="space-y-4">
            {progress.log.map((entry) => (
              <li key={entry.date + entry.title} className="border-l-2 border-primary/40 pl-4">
                <p className="text-caption text-muted-foreground">
                  <time dateTime={entry.date}>{formatDate(entry.date, { weekday: true })}</time>
                </p>
                <h3 className="font-semibold">{entry.title}</h3>
                <p className="text-muted-foreground">{entry.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="border-t border-border pt-4 text-caption text-muted-foreground">
          Data from <code className="font-mono">apps/web/src/content/progress.json</code>, updated
          at the end of each session.
        </footer>
      </main>
    </div>
  );
}

const dayClass = {
  shipped: 'bg-status-done',
  in_progress: 'bg-primary',
  rest: 'bg-border',
  planned: 'bg-muted border border-dashed border-input',
} as const;

const dayLabel = {
  shipped: 'Shipped',
  in_progress: 'In progress',
  rest: 'Rest',
  planned: 'Planned',
} as const;

function Legend() {
  return (
    <ul className="flex flex-wrap gap-3 text-caption text-muted-foreground">
      {(Object.keys(dayClass) as (keyof typeof dayClass)[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-3 rounded-[3px] ${dayClass[k]}`} />
          {dayLabel[k]}
        </li>
      ))}
    </ul>
  );
}

function ProgressBar({ value, label, thin }: { value: number; label: string; thin?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full overflow-hidden rounded-pill bg-border/70 ${thin ? 'h-1.5' : 'h-2.5'}`}
    >
      <div
        className={`h-full rounded-pill ${value === 100 ? 'bg-status-done' : 'bg-primary'}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function Checklist({ items }: { items: { label: string; done: boolean }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex gap-2">
          <span
            aria-hidden
            className={`mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-pill text-[11px] ${item.done ? 'bg-status-done text-white' : 'border border-input'}`}
          >
            {item.done ? '✓' : ''}
          </span>
          <span className={item.done ? '' : 'text-muted-foreground'}>
            <span className="sr-only">{item.done ? 'Done: ' : 'To do: '}</span>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
