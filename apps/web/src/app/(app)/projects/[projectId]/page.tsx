import { Suspense } from 'react';
import { ProjectView } from './project-view';

// ProjectView reads the route param and ?task= with client hooks; with Cache Components
// those must sit inside a Suspense boundary (Next 16).
export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectView />
    </Suspense>
  );
}
