/**
 * TaskFlow API contract.
 *
 * Everything here is generated from `openapi.yaml`, the single source of truth shared by
 * the web app, the MSW mock API and (later) the backend. Never edit `src/generated` by hand:
 * change the YAML, then run `pnpm --filter @taskflow/api-contract generate`.
 */

// `paths` / `components` / `operations`: the full typed contract, used by openapi-fetch and MSW.
// The named exports (Task, Problem, TaskStatus, ...) are shortcuts for components['schemas'][...].
export * from './generated/schema';
