/**
 * The access token lives in memory only — never in localStorage, where any injected
 * script (XSS) could read it. After a reload it's gone; the app gets a new one from
 * POST /auth/refresh, which uses the httpOnly refresh cookie the browser sends automatically.
 */
let accessToken: string | null = null;
const listeners = new Set<() => void>();

/**
 * Bumped on logout. A refresh that started before the logout must not install its
 * token after it (the user would be logged back in), so it checks this number first.
 */
let sessionGeneration = 0;

export function getSessionGeneration() {
  return sessionGeneration;
}

/** Logout: forget the token, and make any refresh already in flight discard its result. */
export function endSession() {
  sessionGeneration += 1;
  setAccessToken(null);
}

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
