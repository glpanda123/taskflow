import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const LOCAL_TEST_DB = 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test';

/**
 * The database the e2e tests run against. They wipe it, so it must never be the app's database.
 *
 * Order: TEST_DATABASE_URL (shell, then apps/api/.env) → DATABASE_URL from the shell (CI)
 * → local Postgres. DATABASE_URL inside .env is the app's database and is never read here.
 */
export function testDatabaseUrl(): string {
  const envFile = join(__dirname, '..', '.env');
  const fromFile = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).TEST_DATABASE_URL
    : undefined;
  return process.env.TEST_DATABASE_URL ?? fromFile ?? process.env.DATABASE_URL ?? LOCAL_TEST_DB;
}
