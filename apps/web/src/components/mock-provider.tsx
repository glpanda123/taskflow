'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

// On by default while there is no backend (prototype phase, including the Vercel
// deploy). Set NEXT_PUBLIC_API_MOCKING=disabled once the real API exists.
const mockingEnabled = process.env.NEXT_PUBLIC_API_MOCKING !== 'disabled';

// `ssr: false`: MSW's browser build doesn't exist on the server (`msw/browser` resolves to
// nothing in Node), so the gate is compiled and loaded in the browser only. When mocking is
// off, the mock code is never downloaded.
const MockGate = mockingEnabled ? dynamic(() => import('@/mocks/mock-gate'), { ssr: false }) : null;

export function MockProvider({ children }: { children: ReactNode }) {
  return MockGate ? <MockGate>{children}</MockGate> : children;
}
