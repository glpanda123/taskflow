/**
 * Turns openapi-fetch's `{ data, error }` results into thrown errors, which is what
 * TanStack Query expects (`isError`, `error`, retries, `onError`…), and gives the UI
 * small helpers for the error kinds it handles specially.
 */
import type { ConflictProblem, Problem, Task, ValidationProblem } from '@taskflow/api-contract';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

type Result<D> =
  | { data: D; error?: never; response: Response }
  | { data?: never; error: unknown; response: Response };

/** `await unwrap(api.GET(...))` → the data, or throws ApiError with the problem body. */
export async function unwrap<D>(request: Promise<Result<D>>): Promise<D> {
  const { data, error, response } = await request;
  if (error !== undefined || !response.ok) {
    const problem = (error as Problem | undefined) ?? {
      type: 'about:blank',
      title: response.statusText || 'Request failed',
      status: response.status,
    };
    throw new ApiError(response.status, problem);
  }
  return data as D;
}

/** 422 → `{ title: 'Title is required' }`, ready to show next to form fields. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.status !== 422) return {};
  const errors = (error.problem as ValidationProblem).errors ?? [];
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

/** 409 on a task write → the task as it is now on the server, else null. */
export function conflictTask(error: unknown): Task | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  return (error.problem as ConflictProblem).current ?? null;
}

/** One human-readable line for a toast or an inline error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return 'Something went wrong. Check your connection and try again.';
}
