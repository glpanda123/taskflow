import { MockProvider } from '@/components/mock-provider';
import { Providers } from './providers';

/**
 * Everything that talks to the API lives under this group, behind the mock API (MSW).
 * Pages outside it (/status) render on the server and don't wait for the service worker.
 */
export default function PrototypeLayout({ children }: LayoutProps<'/'>) {
  return (
    <MockProvider>
      <Providers>{children}</Providers>
    </MockProvider>
  );
}
