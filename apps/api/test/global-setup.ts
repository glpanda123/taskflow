import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './test-database-url';

/** Bring the test database to the latest migration before any test runs. */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    // The test database is a plain Postgres: the app address and the migration address are the same.
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), DIRECT_URL: testDatabaseUrl() },
  });
}
