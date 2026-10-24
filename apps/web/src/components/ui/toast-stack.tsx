'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type Toast = { key: number; body: ReactNode };

/**
 * Small notices stacked bottom-right. The region is aria-live="polite", so screen
 * readers read each new notice once, without interrupting.
 */
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (key: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-16 z-50 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          className="pointer-events-auto flex animate-slide-in items-start gap-3 rounded-card border border-border bg-card p-3 text-caption shadow-xl"
        >
          <div className="min-w-0 flex-1">{t.body}</div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.key)}
            className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
