/**
 * An invitation someone opened before they had an account. The invite page stores its
 * token here; after sign-up or log-in the forms send the person back to that page
 * instead of to onboarding. Session storage: it lives in this tab only and is gone
 * when the tab closes.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'taskflow.pendingInvite';

export type PendingInvite = { token: string; email: string };

export function rememberInvite(invite: PendingInvite) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(invite));
  } catch {
    // Storage can be blocked (private mode); the person can open the link again.
  }
}

export function pendingInvite(): PendingInvite | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingInvite) : null;
  } catch {
    return null;
  }
}

export function forgetInvite() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to forget
  }
}

const noSubscription = () => () => {};
const rawInvite = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * The pending invitation, for rendering. Null on the server and during hydration,
 * then the stored value: the form can prefill the invited email without a mismatch.
 */
export function usePendingInvite(): PendingInvite | null {
  const raw = useSyncExternalStore(noSubscription, rawInvite, () => null);
  return raw ? (JSON.parse(raw) as PendingInvite) : null;
}
