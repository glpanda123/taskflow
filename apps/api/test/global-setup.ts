import { execSync } from 'node:child_process';

/** Bring the test database to the latest migration before any test runs. */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test',
    },
  });
}
