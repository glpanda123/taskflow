import { RequireAuth } from '@/lib/auth/session';

/** Every onboarding step needs a logged-in user. */
export default function OnboardingLayout({ children }: LayoutProps<'/onboarding'>) {
  return <RequireAuth>{children}</RequireAuth>;
}
