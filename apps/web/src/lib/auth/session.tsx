'use client';

/**
 * Who is logged in, for the whole app.
 *
 * status: 'loading'       → on first load we ask POST /auth/refresh for a new access token
 *         'authenticated' → we hold an access token (in memory)
 *         'anonymous'     → no session; guarded pages redirect to /login
 */
import type { LoginRequest, RegisterRequest, Session } from '@taskflow/api-contract';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { getAccessToken, onAccessTokenChange, setAccessToken } from './token';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

type AuthContextValue = {
  status: AuthStatus;
  /** Throws ApiError (401 wrong credentials, 422 invalid fields). */
  login: (body: LoginRequest) => Promise<Session>;
  /** Throws ApiError (409 email taken, 422 invalid fields). */
  register: (body: RegisterRequest) => Promise<Session>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [restoring, setRestoring] = useState(true);
  const token = useSyncExternalStore(onAccessTokenChange, getAccessToken, () => null);

  // On load: the access token is gone (memory only), so try the refresh cookie once.
  useEffect(() => {
    api
      .POST('/auth/refresh')
      .then(({ data }) => {
        if (data) setAccessToken(data.accessToken);
      })
      .finally(() => setRestoring(false));
  }, []);

  const startSession = useCallback(
    (session: Session) => {
      setAccessToken(session.accessToken);
      qc.removeQueries(); // nothing cached from a previous user may leak into this session
      return session;
    },
    [qc],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: token ? 'authenticated' : restoring ? 'loading' : 'anonymous',
      login: async (body) => startSession(await unwrap(api.POST('/auth/login', { body }))),
      register: async (body) => startSession(await unwrap(api.POST('/auth/register', { body }))),
      logout: async () => {
        await api.POST('/auth/logout'); // best effort: we log out locally either way
        setAccessToken(null);
        qc.removeQueries();
      },
    }),
    [token, restoring, startSession, qc],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Wrap pages that need a logged-in user. Renders nothing while the session is being
 * restored, and redirects to /login when there is none.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') return null;
  return children;
}
