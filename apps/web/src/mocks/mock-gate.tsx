'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MockDevPanel } from '@/components/mock-dev-panel';
import { startMockApi } from './browser';

/**
 * Starts the MSW service worker, then renders the app, so the very first request
 * already hits the mock API instead of a real (non-existent) backend.
 */
export default function MockGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void startMockApi().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return (
    <>
      {children}
      <MockDevPanel />
    </>
  );
}
