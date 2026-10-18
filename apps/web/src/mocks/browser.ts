import { setupWorker } from 'msw/browser';
import { db, resetDb } from './db';
import { handlers } from './handlers';
import { scenario, setScenario } from './scenario';

export const worker = setupWorker(...handlers);

declare global {
  interface Window {
    /** Console access to the mock API, e.g. `__mock.setScenario({ latencyMs: 2000 })`. */
    __mock?: {
      db: typeof db;
      resetDb: typeof resetDb;
      scenario: typeof scenario;
      setScenario: typeof setScenario;
    };
  }
}

export async function startMockApi() {
  window.__mock = { db, resetDb, scenario, setScenario };
  await worker.start({
    // Requests to /api/v1 that no handler matches are a contract gap: make them loud.
    // (MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; HTTP frames carry the request.)
    onUnhandledFrame({ frame, defaults }) {
      if (frame.protocol !== 'http') return;
      const { request } = frame.data as { request: Request };
      if (new URL(request.url).pathname.startsWith('/api/v1')) defaults.error();
    },
    quiet: true,
  });
}
