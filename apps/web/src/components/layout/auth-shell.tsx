import { Eye, Radio, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';

const highlights = [
  { icon: Eye, text: 'Clients see only their own project, read-only' },
  { icon: Radio, text: 'Live updates for everyone on the board' },
  { icon: Sparkles, text: 'AI drafts the task list from a client brief' },
];

/**
 * Log in / Sign up layout: brand panel on the left, form on the right.
 * Below `md` the brand panel collapses to a one-line header (works at 375px).
 */
export function AuthShell({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle: string;
  /** Link to the other auth page, shown top-right. */
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh flex-1 md:grid-cols-[2fr_3fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-primary via-primary to-violet-700 p-10 text-primary-foreground md:flex">
        {/* Soft dot grid for texture */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.12)_1px,transparent_1px)] bg-size-[18px_18px]"
        />
        <Link href="/" className="relative w-fit">
          <Logo inverted />
        </Link>

        <MiniToday />

        <div className="relative space-y-5">
          <p className="text-title leading-tight font-semibold">
            Know who&apos;s doing what, before anyone has to ask.
          </p>
          <ul className="space-y-2.5">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/85">
                <span className="inline-flex size-8 items-center justify-center rounded-control bg-white/12">
                  <Icon aria-hidden className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="flex flex-col bg-background px-4 py-6 md:px-12">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="md:invisible">
            <Logo />
          </Link>
          <div className="text-caption text-muted-foreground">{aside}</div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 animate-fade-up flex-col justify-center gap-6 py-10">
          <header className="space-y-1">
            <h1 className="text-title font-semibold">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Decorative glimpse of the Today screen. */
function MiniToday() {
  const rows = [
    { t: 'Write homepage copy', d: '2 days late', late: true, c: 'bg-sky-400' },
    { t: 'Design pricing page', d: 'Tomorrow', late: false, c: 'bg-sky-400' },
    { t: 'App store screenshots', d: 'Fri', late: false, c: 'bg-violet-400' },
  ];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm animate-float">
      <div className="rounded-card bg-white p-4 text-foreground shadow-2xl">
        <p className="text-[11px] text-muted-foreground">Thursday, October 22</p>
        <p className="text-[15px] font-semibold">Good to see you, Ly</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { n: 2, l: 'Late', cls: 'bg-status-overdue-subtle text-status-overdue-text' },
            { n: 5, l: 'Due soon', cls: 'bg-amber-50 text-amber-700' },
            { n: 3, l: 'In progress', cls: 'bg-accent text-accent-foreground' },
          ].map((s) => (
            <div key={s.l} className={`rounded-md px-2 py-1.5 ${s.cls}`}>
              <p className="text-[15px] font-semibold">{s.n}</p>
              <p className="text-[10px]">{s.l}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 divide-y divide-border">
          {rows.map((r) => (
            <li key={r.t} className="flex items-center gap-2 py-1.5 text-[11px]">
              <span className={`h-4 w-0.5 rounded-pill ${r.c}`} />
              <span className="flex-1 truncate font-medium">{r.t}</span>
              <span
                className={
                  r.late
                    ? 'rounded-pill bg-status-overdue-subtle px-1.5 font-medium text-status-overdue-text'
                    : 'text-muted-foreground'
                }
              >
                {r.d}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
