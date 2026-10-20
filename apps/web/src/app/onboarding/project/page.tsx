import { Suspense } from 'react';
import { ProjectStep } from './project-step';

// The step reads ?workspaceId= with useSearchParams, which must sit inside a Suspense
// boundary so the rest of the page can still be prerendered (Next 16 rule).
export default function OnboardingProjectPage() {
  return (
    <Suspense>
      <ProjectStep />
    </Suspense>
  );
}
