import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database-url';

/** Bring the test database to the latest migration before any test runs. */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
  });
}
