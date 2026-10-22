import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/layout/auth-shell';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account · TaskFlow' };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free for teams up to 15. Next, you'll set up your team's workspace."
      aside={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
