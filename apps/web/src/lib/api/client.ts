/**
 * The one HTTP client for the TaskFlow API.
 *
 * `createClient<paths>` gives every call full types from the OpenAPI contract:
 *   api.GET('/projects/{projectId}/tasks', { params: { path: { projectId }, query: { limit: 20 } } })
 * A wrong path, a missing param or a wrong body field is a compile error.
 */
import type { paths } from '@taskflow/api-contract';
import createClient, { type Middleware } from 'openapi-fetch';
import { getAccessToken, setAccessToken } from '@/lib/auth/token';

export const api = createClient<paths>({ baseUrl: '/api/v1' });

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/**
 * One refresh at a time. The refresh token is single-use (the server rotates it), so if
 * three requests hit 401 together they must share ONE refresh: three parallel refreshes
 * would present the same cookie three times, and the server treats reuse as theft.
 */
let refreshing: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) =>
      res.ok ? ((await res.json()) as { accessToken: string }).accessToken : null,
    )
    .catch(() => null)
    .then((token) => {
      setAccessToken(token); // null → logged out; the route guard sends the user to /login
      return token;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** A copy of each outgoing request, kept until its response, so a 401 can be replayed. */
const pending = new Map<string, Request>();

const authMiddleware: Middleware = {
  onRequest({ request, id }) {
    const token = getAccessToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    pending.set(id, request.clone()); // the body of `request` is read once by fetch
    return request;
  },
  async onResponse({ response, schemaPath, id }) {
    const original = pending.get(id);
    pending.delete(id);
    if (response.status !== 401 || AUTH_PATHS.includes(schemaPath) || !original) return response;

    // The access token expired (15 min) or was revoked: get a new one once, replay once.
    const token = await refreshAccessToken();
    if (!token) return response;
    original.headers.set('Authorization', `Bearer ${token}`);
    return fetch(original);
  },
  onError({ id }) {
    pending.delete(id);
  },
};

api.use(authMiddleware);
