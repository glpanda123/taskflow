'use client';

import { useState, useSyncExternalStore } from 'react';
import { scenario, setScenario, subscribeScenario, type Scenario } from '@/mocks/scenario';

const getSnapshot = () => JSON.stringify(scenario);

/**
 * Floating panel (bottom-right) to drive the mock API: slow network, a failing
 * request, or a concurrent edit by "someone else". Only rendered when mocking is on.
 */
export function MockDevPanel() {
  const snapshot = useSyncExternalStore(subscribeScenario, getSnapshot, getSnapshot);
  const s = JSON.parse(snapshot) as Scenario;
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-3 bottom-3 z-50 text-sm">
      {open ? (
        <div className="w-64 space-y-3 rounded-lg border border-zinc-300 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <strong>Mock API</strong>
            <button
              type="button"
              className="px-2"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <label className="flex items-center justify-between gap-2">
            Latency
            <select
              className="rounded border px-1 py-0.5"
              value={s.latencyMs}
              onChange={(e) => setScenario({ latencyMs: Number(e.target.value) })}
            >
              <option value={0}>0 ms</option>
              <option value={800}>800 ms</option>
              <option value={2500}>2.5 s</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.teammates}
              onChange={(e) => setScenario({ teammates: e.target.checked })}
            />
            Virtual teammates move tasks (realtime)
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.conflictNext}
              onChange={(e) => setScenario({ conflictNext: e.target.checked })}
            />
            Next task save: someone else edited it (409)
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.failNext !== null}
              onChange={(e) => setScenario({ failNext: e.target.checked ? 500 : null })}
            />
            Next request fails (500)
          </label>

          <button
            type="button"
            className="w-full rounded border px-2 py-1"
            // Mock data lives in this tab's memory, so a reload re-seeds it.
            onClick={() => location.reload()}
          >
            Reset mock data
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 shadow"
          onClick={() => setOpen(true)}
        >
          Mock API{s.conflictNext || s.failNext ? ' •' : ''}
        </button>
      )}
    </div>
  );
}
