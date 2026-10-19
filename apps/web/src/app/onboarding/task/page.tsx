import { Suspense } from 'react';
import { TaskStep } from './task-step';

export default function OnboardingTaskPage() {
  return (
    <Suspense>
      <TaskStep />
    </Suspense>
  );
}
