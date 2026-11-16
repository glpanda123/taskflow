import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InviteView } from './invite-view';

export const metadata: Metadata = { title: 'Invitation · TaskFlow' };

// InviteView reads the route param with a client hook; with Cache Components that
// must sit inside a Suspense boundary (Next 16).
export default function InvitePage() {
  return (
    <Suspense>
      <InviteView />
    </Suspense>
  );
}
