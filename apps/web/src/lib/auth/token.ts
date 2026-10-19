/**
 * The access token lives in memory only — never in localStorage, where any injected
 * script (XSS) could read it. After a reload it's gone; the app gets a new one from
 * POST /auth/refresh, which uses the httpOnly refresh cookie the browser sends automatically.
 */
let accessToken: string | null = null;
const listeners = new Set<() => void>();

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  listeners.forEach((l) => l());
}

export function onAccessTokenChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
