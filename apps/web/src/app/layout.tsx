import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { MockProvider } from '@/components/mock-provider';
import { Providers } from './providers';
import './globals.css';

// font.sans / font.mono from the design tokens. `vietnamese` subset for Vietnamese names.
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin', 'vietnamese'],
  weight: ['400'],
});

export const metadata: Metadata = {
  title: 'TaskFlow',
  description: 'Task management for small teams',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <MockProvider>
          <Providers>{children}</Providers>
        </MockProvider>
      </body>
    </html>
  );
}
