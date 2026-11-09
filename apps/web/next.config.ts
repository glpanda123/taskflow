import type { NextConfig } from 'next';

/**
 * Where the real API runs (server-side only, e.g. http://localhost:3001). When set,
 * the browser keeps calling /api/v1 on this site and Next forwards it there: one origin
 * for the browser, so the SameSite=Strict refresh cookie works and no CORS is needed.
 * Unset while the app runs on the mock API (MSW answers /api/v1 inside the browser).
 */
const apiUrl = process.env.API_URL;

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@taskflow/api-contract'],
  async rewrites() {
    return apiUrl ? [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }] : [];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
