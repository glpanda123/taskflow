import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Log in / Sign up layout from the mockup: brand panel on the left, form on the right.
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
    <div className="grid min-h-dvh md:grid-cols-[2fr_3fr]">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex">
        <Link href="/" className="text-section font-semibold">
          TaskFlow
        </Link>
        <div className="space-y-3">
          <p className="text-title leading-tight font-semibold">
            Know who&apos;s doing what, before anyone has to ask.
          </p>
          <p className="opacity-80">Built for teams of 3–15</p>
        </div>
      </section>

      <main className="flex flex-col px-4 py-6 md:px-12">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-section font-semibold md:invisible">
            TaskFlow
          </Link>
          <div className="text-caption text-muted-foreground">{aside}</div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-10">
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
