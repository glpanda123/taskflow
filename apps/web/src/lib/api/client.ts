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

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getAccessToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
  onResponse({ response, schemaPath }) {
    // Token expired or revoked on any normal endpoint → treat as logged out.
    // The auth provider sees the token disappear and the route guard sends the user to /login.
    // (Next step for the real API: try POST /auth/refresh once and replay the request.)
    if (response.status === 401 && !AUTH_PATHS.includes(schemaPath)) setAccessToken(null);
    return response;
  },
};

api.use(authMiddleware);
