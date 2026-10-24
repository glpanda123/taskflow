import {
  ArrowRight,
  CalendarClock,
  Camera,
  Check,
  Eye,
  MessageCircleQuestion,
  Radio,
  ShieldCheck,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { BoardPreview } from '@/components/marketing/board-preview';

export const metadata: Metadata = {
  title: 'TaskFlow — the task board for agencies that work with clients',
  description:
    'See what is slipping on one screen, give each client a live read-only view of their project, and let AI draft the task list from a brief.',
};

const pains: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessageCircleQuestion,
    title: '"Who\'s on what?"',
    body: 'Every morning the lead chases status across Zalo threads and spreadsheets.',
  },
  {
    icon: CalendarClock,
    title: 'Late, found too late',
    body: 'Work slips quietly. You hear about it after the deadline, usually from the client.',
  },
  {
    icon: Camera,
    title: 'Status by screenshot',
    body: 'Clients get pictures of the board, because sharing it would show them everything.',
  },
];

const features: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  accent: string;
}[] = [
  {
    icon: Sun,
    eyebrow: 'Today',
    title: 'One screen for what needs you',
    body: 'Late work, what is due this week and what nobody owns — across every project, before standup.',
    points: ['Late work flagged in words, not just colour', 'Projects to watch, ranked'],
    accent: 'bg-amber-50 text-amber-700',
  },
  {
    icon: Eye,
    eyebrow: 'Client viewers',
    title: 'Clients see their project. Only theirs.',
    body: 'Invite a client to one project. They follow progress live and can’t change a thing — or see your other clients.',
    points: ['Read-only by design', 'Free on every plan'],
    accent: 'bg-sky-50 text-sky-700',
  },
  {
    icon: Sparkles,
    eyebrow: 'AI drafting',
    title: 'From client brief to task list',
    body: 'Paste the brief. AI drafts structured tasks with priorities and dates. You review before anything is saved.',
    points: ['You stay in control', 'Checked against a schema'],
    accent: 'bg-violet-50 text-violet-700',
  },
];

const steps = [
  { title: 'Create a workspace', body: 'Name it, add your first project. Under three minutes.' },
  { title: 'Paste the brief', body: 'AI drafts the tasks; you adjust and assign.' },
  { title: 'Invite team and client', body: 'Members work the board; the client watches it move.' },
];

export default function LandingPage() {
  return (
    <div className="flex-1 overflow-x-clip bg-card">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" aria-label="TaskFlow home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            <a
              href="#features"
              className="hidden min-h-touch items-center rounded-control px-3 text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="hidden min-h-touch items-center rounded-control px-3 text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Pricing
            </a>
            <Link
              href="/status"
              className="hidden min-h-touch items-center rounded-control px-3 text-muted-foreground hover:text-foreground md:inline-flex"
            >
              Build status
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-touch items-center rounded-control px-3 font-medium hover:bg-muted"
            >
              Log in
            </Link>
            <Link
              href="/demo"
              className="inline-flex min-h-touch items-center gap-1.5 rounded-control bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Try the demo
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 -z-0 h-[560px] bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_65%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-24 md:px-8 lg:pt-20">
            <div className="mx-auto max-w-3xl animate-fade-up space-y-6 text-center">
              <p className="inline-flex items-center gap-2 rounded-pill bg-card px-3 py-1 text-caption font-medium text-accent-foreground ring-1 ring-border">
                <span className="size-1.5 rounded-pill bg-primary" />
                For agencies of 5–15 people
              </p>
              <h1 className="text-[38px] leading-[1.1] font-semibold tracking-tight md:text-[56px]">
                Your team&apos;s work, clear to everyone.{' '}
                <span className="text-primary">Including your clients.</span>
              </h1>
              <p className="mx-auto max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
                TaskFlow is a lightweight task board for teams that deliver projects to clients. See
                what&apos;s slipping on one screen, give each client a live read-only view of their
                project, and let AI draft the task list from a brief.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/demo"
                  className="group inline-flex min-h-touch items-center gap-2 rounded-control bg-primary px-5 font-medium text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover"
                >
                  Try the live demo
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <a
                  href="#how"
                  className="inline-flex min-h-touch items-center rounded-control border border-input bg-card px-5 font-medium hover:bg-muted"
                >
                  How it works
                </a>
              </div>
              <p className="text-caption text-muted-foreground">
                Prototype · the demo runs in your browser on sample data, no sign-up.
              </p>
            </div>
            <div className="mx-auto mt-14 max-w-5xl animate-fade-up px-2 [animation-delay:150ms] md:px-6">
              <BoardPreview />
            </div>
          </div>
        </section>

        {/* Problem */}
        <section aria-labelledby="problem-heading" className="border-y border-border bg-muted">
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 md:px-8">
            <div className="max-w-2xl space-y-3">
              <p className="text-caption font-semibold tracking-wider text-primary uppercase">
                The problem
              </p>
              <h2 id="problem-heading" className="text-title font-semibold md:text-[34px]">
                Client work runs on chat threads and screenshots
              </h2>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {pains.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-card border border-border bg-card p-6">
                  <span className="inline-flex size-10 items-center justify-center rounded-control bg-status-overdue-subtle text-status-overdue-text">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="mt-4 text-section font-semibold">{title}</h3>
                  <p className="mt-1 text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-heading" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 md:px-8">
            <div className="max-w-2xl space-y-3">
              <p className="text-caption font-semibold tracking-wider text-primary uppercase">
                What TaskFlow does
              </p>
              <h2 id="features-heading" className="text-title font-semibold md:text-[34px]">
                Three things, done well
              </h2>
              <p className="text-muted-foreground">
                No sprints, no custom workflows to configure. Just what a small client team needs
                every day.
              </p>
            </div>
            <ul className="grid gap-5 lg:grid-cols-3">
              {features.map(({ icon: Icon, eyebrow, title, body, points, accent }) => (
                <li
                  key={title}
                  className="flex flex-col rounded-card border border-border bg-card p-6 shadow-xs transition-shadow hover:shadow-lg"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex size-10 items-center justify-center rounded-control ${accent}`}
                    >
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="text-caption font-semibold text-muted-foreground">
                      {eyebrow}
                    </span>
                  </span>
                  <h3 className="mt-4 text-section font-semibold">{title}</h3>
                  <p className="mt-2 flex-1 text-muted-foreground">{body}</p>
                  <ul className="mt-5 space-y-1.5 border-t border-border pt-4 text-caption">
                    {points.map((p) => (
                      <li key={p} className="flex items-center gap-2">
                        <Check aria-hidden className="size-4 text-status-done" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="grid gap-4 rounded-card bg-foreground p-6 text-white md:grid-cols-3 md:p-8">
              {[
                { icon: Radio, k: '< 1 s', v: 'Board changes reach every open tab' },
                { icon: Sun, k: '< 3 min', v: 'From sign-up to the first assigned task' },
                { icon: ShieldCheck, k: '0', v: 'Data shared across workspaces, tested in CI' },
              ].map(({ icon: Icon, k, v }) => (
                <div key={v} className="flex items-start gap-3">
                  <Icon aria-hidden className="mt-1 size-5 shrink-0 text-white/60" />
                  <div>
                    <p className="text-title font-semibold">{k}</p>
                    <p className="text-white/70">{v}</p>
                  </div>
                </div>
              ))}
              <p className="text-caption text-white/50 md:col-span-3">
                Design targets for v1, measured as the backend ships. Progress is public on the
                build status page.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how"
          aria-labelledby="how-heading"
          className="scroll-mt-20 border-y border-border bg-muted"
        >
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 md:px-8">
            <div className="max-w-2xl space-y-3">
              <p className="text-caption font-semibold tracking-wider text-primary uppercase">
                How it works
              </p>
              <h2 id="how-heading" className="text-title font-semibold md:text-[34px]">
                Up and running before your next standup
              </h2>
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className="relative rounded-card border border-border bg-card p-6"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-pill bg-primary font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-section font-semibold">{s.title}</h3>
                  <p className="mt-1 text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-20 md:px-8">
            <div className="max-w-2xl space-y-3">
              <p className="text-caption font-semibold tracking-wider text-primary uppercase">
                Pricing
              </p>
              <h2 id="pricing-heading" className="text-title font-semibold md:text-[34px]">
                Clients never count as seats
              </h2>
              <p className="text-muted-foreground">Planned pricing for launch.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <PlanCard
                name="Free"
                price="0đ"
                note="For small teams getting started"
                items={['Up to 5 members', '3 projects', 'Unlimited client viewers']}
              />
              <PlanCard
                name="Team"
                price="75.000đ"
                note="per member / month"
                items={[
                  'Unlimited members and projects',
                  'AI task drafting',
                  'Unlimited client viewers, always free',
                ]}
                highlighted
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20 md:px-8">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[20px] bg-linear-to-br from-primary to-violet-600 px-6 py-14 text-center text-white md:px-12">
            <h2 className="text-title font-semibold md:text-[34px]">
              See it with real-looking data
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">
              Open the demo as the owner of a small studio: check Today, open a project, invite a
              client viewer.
            </p>
            <Link
              href="/demo"
              className="mt-8 inline-flex min-h-touch items-center gap-2 rounded-control bg-white px-6 font-semibold text-primary hover:bg-white/90"
            >
              Try the live demo <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-caption text-muted-foreground md:px-8">
          <span className="flex items-center gap-3">
            <Logo />
          </span>
          <nav aria-label="For reviewers" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/status" className="hover:text-foreground">
              Build status
            </Link>
            <Link href="/api-docs" className="hover:text-foreground">
              API contract
            </Link>
            <Link href="/dev" className="hover:text-foreground">
              Edit-conflict playground
            </Link>
            <a href="https://github.com/glpanda123/taskflow" className="hover:text-foreground">
              Source on GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function PlanCard({
  name,
  price,
  note,
  items,
  highlighted,
}: {
  name: string;
  price: string;
  note: string;
  items: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-6 md:p-8 ${highlighted ? 'border-primary bg-accent/40 ring-1 ring-primary' : 'border-border bg-card'}`}
    >
      <p className="font-semibold">{name}</p>
      <p className="mt-2">
        <span className="text-[34px] font-semibold">{price}</span>{' '}
        <span className="text-muted-foreground">{note}</span>
      </p>
      <ul className="mt-5 space-y-2">
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2">
            <Check aria-hidden className="size-4 text-status-done" />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
