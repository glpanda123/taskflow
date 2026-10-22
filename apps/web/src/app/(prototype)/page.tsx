import Link from 'next/link';

// Temporary prototype index. Replaced by Login / Today once the real screens land.
const statuses = [
  { label: 'To do', className: 'bg-status-todo' },
  { label: 'In progress', className: 'bg-status-in-progress' },
  { label: 'In review', className: 'bg-status-in-review' },
  { label: 'Done', className: 'bg-status-done' },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <header className="space-y-2">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">
          Prototype
        </p>
        <h1 className="text-title font-semibold">TaskFlow</h1>
        <p className="text-muted-foreground">
          Task management for small teams. This build runs on a mock API (MSW), so data lives in
          your browser tab and resets on reload.
        </p>
      </header>

      <section className="space-y-3 rounded-card border border-border bg-card p-6">
        <h2 className="text-section font-semibold">Try it</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex min-h-touch items-center rounded-control bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-touch items-center rounded-control border border-input bg-card px-4 font-medium hover:bg-accent"
          >
            Log in
          </Link>
          <Link
            href="/dev"
            className="inline-flex min-h-touch items-center rounded-control border border-input bg-card px-4 font-medium hover:bg-accent"
          >
            409 playground
          </Link>
          <Link
            href="/status"
            className="inline-flex min-h-touch items-center rounded-control border border-input bg-card px-4 font-medium hover:bg-accent"
          >
            Build status
          </Link>
          <Link
            href="/api-docs"
            className="inline-flex min-h-touch items-center rounded-control border border-input bg-card px-4 font-medium hover:bg-accent"
          >
            API contract (Swagger)
          </Link>
        </div>
      </section>

      <section className="space-y-3 rounded-card border border-border bg-card p-6">
        <h2 className="text-section font-semibold">Status colors</h2>
        <ul className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <li
              key={s.label}
              className="inline-flex items-center gap-2 rounded-pill border border-border px-3 py-1 text-caption"
            >
              <span aria-hidden className={`size-2.5 rounded-pill ${s.className}`} />
              {s.label}
            </li>
          ))}
          <li className="inline-flex items-center rounded-pill bg-status-overdue-subtle px-3 py-1 text-caption font-medium text-status-overdue-text">
            Overdue · 2 days
          </li>
        </ul>
      </section>
    </main>
  );
}
