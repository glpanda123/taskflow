import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS resolves constructor dependencies from TypeScript's decorator metadata;
// esbuild (Vitest's default) doesn't emit it, SWC does.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test',
      JWT_SECRET: 'test-secret-at-least-32-characters-long',
    },
    // One database: test files run one after another.
    fileParallelism: false,
    projects: [
      // Pure functions, no database: `pnpm test:unit` works on any machine.
      { extends: true, test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      // Real HTTP + real Postgres.
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e.test.ts'],
          globalSetup: ['./test/global-setup.ts'],
        },
      },
    ],
  },
});
