#!/usr/bin/env node
/**
 * Applies the committed migrations to the integration test database.
 *
 * Kept separate from `migrate:deploy` so that running the test suite can never touch the
 * development database by accident.
 */
import { execFileSync } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});
