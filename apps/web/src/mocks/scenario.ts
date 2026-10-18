/**
 * Dev switches for the mock API, so every UI state can be reproduced on demand:
 * slow network (loading states), a failing request (error states) and a concurrent
 * edit by "someone else" (the 409 conflict flow).
 *
 * Set from the dev panel, or from the browser console via `window.__mock`.
 */
export type Scenario = {
  /** Extra delay added to every request, in ms. */
  latencyMs: number;
  /** If set, the next request fails with this status, then the switch resets. */
  failNext: 500 | 503 | null;
  /** If true, the next task write finds the task already changed by someone else → 409. */
  conflictNext: boolean;
};

export const scenario: Scenario = { latencyMs: 0, failNext: null, conflictNext: false };

type Listener = () => void;
const listeners = new Set<Listener>();

export function setScenario(patch: Partial<Scenario>) {
  Object.assign(scenario, patch);
  listeners.forEach((l) => l());
}

export function subscribeScenario(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reads a one-shot switch and turns it off, so it affects exactly one request. */
export function consume<K extends 'failNext' | 'conflictNext'>(key: K): Scenario[K] {
  const value = scenario[key];
  setScenario({ [key]: key === 'failNext' ? null : false } as Partial<Scenario>);
  return value;
}
