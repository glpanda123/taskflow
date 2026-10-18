import { delay, HttpResponse } from 'msw';
import { http, problem } from '../http';
import { consume, scenario } from '../scenario';
import { authHandlers } from './auth';
import { memberHandlers } from './members';
import { taskHandlers } from './tasks';
import { workspaceHandlers } from './workspaces';

/**
 * Runs first for every API request. Returning nothing lets MSW fall through to the
 * real handler below; returning a response short-circuits it.
 */
const scenarioHandler = http.untyped.all('/api/v1/*', async () => {
  if (scenario.latencyMs > 0) await delay(scenario.latencyMs);
  const failWith = consume('failNext');
  if (failWith) {
    return HttpResponse.json(problem(failWith, 'server-error', 'Simulated server error'), {
      status: failWith,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }
  return undefined;
});

export const handlers = [
  scenarioHandler,
  ...authHandlers,
  ...workspaceHandlers,
  ...taskHandlers,
  ...memberHandlers,
];
