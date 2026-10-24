import { Eye, Radio } from 'lucide-react';

/**
 * A static, decorative picture of the product (a project board) built from markup,
 * so it stays sharp, matches the theme and needs no image files. Hidden from
 * assistive tech: the surrounding text says what it shows.
 */

type Card = { title: string; who: string; due?: string; late?: boolean; label: string };

const columns: { name: string; dot: string; cards: Card[] }[] = [
  {
    name: 'To do',
    dot: 'bg-status-todo',
    cards: [
      { title: 'Collect client logos', who: 'AP', due: 'Oct 25', label: 'Content' },
      { title: 'Write homepage copy', who: 'AP', due: '2 days late', late: true, label: 'Copy' },
    ],
  },
  {
    name: 'In progress',
    dot: 'bg-status-in-progress',
    cards: [
      { title: 'Build navigation', who: 'LN', due: 'Fri', label: 'Dev' },
      { title: 'Fix contact form', who: 'MT', due: '1 day late', late: true, label: 'Dev' },
    ],
  },
  {
    name: 'In review',
    dot: 'bg-status-in-review',
    cards: [{ title: 'Design pricing page', who: 'MT', due: 'Tomorrow', label: 'Design' }],
  },
  {
    name: 'Done',
    dot: 'bg-status-done',
    cards: [
      { title: 'Sitemap & wireframes', who: 'LN', label: 'Design' },
      { title: 'Kick-off with client', who: 'LN', label: 'PM' },
    ],
  },
];

export function BoardPreview({ floating = true }: { floating?: boolean }) {
  return (
    <div aria-hidden className="relative select-none">
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-2xl shadow-primary/10">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
          <span className="size-2.5 rounded-pill bg-rose-300" />
          <span className="size-2.5 rounded-pill bg-amber-300" />
          <span className="size-2.5 rounded-pill bg-emerald-300" />
          <span className="ml-3 truncate rounded-pill bg-card px-3 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
            taskflow.app/projects/website-redesign
          </span>
        </div>

        <div className="flex">
          {/* Mini sidebar */}
          <div className="hidden w-36 shrink-0 space-y-1.5 border-r border-border p-3 text-[11px] lg:block">
            <div className="mb-3 h-2 w-16 rounded-pill bg-border" />
            {['Today', 'Website redesign', 'Mobile app', 'Members'].map((item, i) => (
              <div
                key={item}
                className={`flex items-center gap-1.5 rounded px-2 py-1 ${i === 1 ? 'bg-accent font-semibold text-accent-foreground' : 'text-muted-foreground'}`}
              >
                <span
                  className={`size-1.5 rounded-[2px] ${i === 1 ? 'bg-sky-500' : i === 2 ? 'bg-violet-500' : 'bg-border'}`}
                />
                {item}
              </div>
            ))}
          </div>

          {/* Board */}
          <div className="min-w-0 flex-1 p-3 md:p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground">Acme Studio / Projects</p>
                <p className="text-[13px] font-semibold">Website redesign</p>
              </div>
              <div className="flex -space-x-1.5">
                {['LN', 'MT', 'AP'].map((i) => (
                  <span
                    key={i}
                    className="inline-flex size-6 items-center justify-center rounded-pill bg-accent text-[9px] font-semibold text-accent-foreground ring-2 ring-card"
                  >
                    {i}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {columns.map((col, ci) => (
                <div
                  key={col.name}
                  className={`space-y-1.5 rounded-lg bg-muted p-1.5 ring-1 ring-border ${ci > 1 ? 'hidden sm:block' : ''}`}
                >
                  <p className="flex items-center gap-1.5 px-1 text-[10px] font-semibold">
                    <span className={`size-1.5 rounded-pill ${col.dot}`} />
                    {col.name}
                    <span className="text-muted-foreground">{col.cards.length}</span>
                  </p>
                  {col.cards.map((card) => (
                    <div
                      key={card.title}
                      className={`space-y-1.5 rounded-md bg-card p-2 shadow-xs ring-1 ${card.title === 'Design pricing page' ? 'ring-2 ring-primary/60' : 'ring-border'}`}
                    >
                      <p className="text-[11px] leading-tight font-medium">{card.title}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                          {card.label}
                        </span>
                        <span className="flex items-center gap-1">
                          {card.due && (
                            <span
                              className={`text-[9px] ${card.late ? 'rounded-pill bg-status-overdue-subtle px-1 font-medium text-status-overdue-text' : 'text-muted-foreground'}`}
                            >
                              {card.due}
                            </span>
                          )}
                          <span className="inline-flex size-4 items-center justify-center rounded-pill bg-accent text-[7px] font-semibold text-accent-foreground">
                            {card.who}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {floating && (
        <>
          {/* Live update toast */}
          <div className="absolute -right-3 -bottom-5 w-64 animate-slide-in rounded-card border border-border bg-card p-3 shadow-xl [animation-delay:700ms] md:-right-6">
            <div className="flex items-start gap-2.5">
              <span className="relative mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-violet-100 text-[10px] font-semibold text-violet-800">
                MT
                <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-pill bg-emerald-500 ring-2 ring-card" />
              </span>
              <div className="min-w-0 text-[12px] leading-snug">
                <p>
                  <span className="font-semibold">Minh</span> moved{' '}
                  <span className="font-medium">Design pricing page</span> to In review
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Radio className="size-3 text-emerald-600" /> Live · just now
                </p>
              </div>
            </div>
          </div>

          {/* Client viewer badge */}
          <div className="absolute top-20 -left-3 hidden animate-float items-center gap-2.5 rounded-card border border-border bg-card px-3 py-2 shadow-xl sm:flex md:-left-8">
            <span className="inline-flex size-7 items-center justify-center rounded-control bg-sky-50 text-sky-700">
              <Eye className="size-4" />
            </span>
            <div className="text-[12px] leading-snug">
              <p className="font-semibold">Client view · read-only</p>
              <p className="text-[11px] text-muted-foreground">Sees Website redesign only</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
