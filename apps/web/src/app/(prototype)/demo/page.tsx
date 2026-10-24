'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { errorMessage } from '@/lib/api/errors';
import { meQuery } from '@/lib/api/queries';
import { useAuth } from '@/lib/auth/session';
import { demoAccount } from '@/lib/demo';

/** One click from the landing page into the app, signed in as the demo studio's owner. */
export default function DemoPage() {
  const { login } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development; log in only once.
    if (started.current) return;
    started.current = true;
    login(demoAccount)
      .then(() => queryClient.fetchQuery(meQuery))
      .then(() => router.replace('/today'))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [login, queryClient, router]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark className="size-12" />
      {error ? (
        <>
          <p role="alert" className="font-semibold">
            We couldn&apos;t open the demo: {error}
          </p>
          <Link href="/login" className="text-primary underline">
            Log in instead
          </Link>
        </>
      ) : (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          Opening the demo studio…
        </p>
      )}
    </main>
  );
}
