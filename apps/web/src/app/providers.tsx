'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';
import { AuthProvider } from '@/lib/auth/session';

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser tab, created once (useState, not module scope, so tests and
  // server rendering never share a cache between users).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retrying a 4xx can't succeed (wrong input, no access, not found); only retry
            // network errors and 5xx, at most twice.
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status < 500) && failureCount < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
