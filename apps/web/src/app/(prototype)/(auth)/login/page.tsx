import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/layout/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Log in · TaskFlow' };

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back. Pick up where your team left off."
      aside={
        <>
          New to TaskFlow?{' '}
          <Link href="/signup" className="font-medium text-primary underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
