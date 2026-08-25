#!/usr/bin/env node
/**
 * Puts the end-to-end database into a known state.
 *
 * This runs before Playwright starts the servers, because the API refuses to boot without a
 * migrated database. The suite asserts on seeded venues, prices and accounts, so every run starts
 * from the committed migrations and the seed rather than from whatever the previous run left
 * behind. The schema is brought forward with `migrate deploy` and the rows are cleared with a
 * truncate — the same pair the integration suite uses — so the reset never drops a database.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaults = JSON.parse(readFileSync(path.join(here, '..', 'e2e.config.json'), 'utf8'));
const databasePackageDir = path.resolve(here, '..', '..', '..', 'packages', 'database');

const databaseUrl = process.env.E2E_DATABASE_URL ?? defaults.databaseUrl;

if (/\/moodisto(_test)?\?/.test(databaseUrl)) {
  console.error(
    `Refusing to reset ${databaseUrl}: that is the development or integration database. ` +
      'Point E2E_DATABASE_URL at a dedicated one, for example moodisto_e2e.',
  );
  process.exit(1);
}

/** Every table the application writes to. `_prisma_migrations` is deliberately left alone. */
const TABLES = [
  'payments',
  'queue_items',
  'song_requests',
  'player_leases',
  'player_states',
  'blocked_music_rules',
  'music_search_cache',
  'provider_quota_usage',
  'customer_sessions',
  'venue_qr_codes',
  'venue_request_pricing',
  'venue_users',
  'tracks',
  'venues',
];

const run = (args, { env = {}, input } = {}) => {
  execFileSync('pnpm', args, {
    cwd: databasePackageDir,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, ...env },
    input,
  });
};

run(['exec', 'prisma', 'migrate', 'deploy'], { env: { DATABASE_URL: databaseUrl } });

run(['exec', 'prisma', 'db', 'execute', '--url', databaseUrl, '--stdin'], {
  input: `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE;`,
});

run(['exec', 'tsx', 'prisma/seed.ts'], {
  env: {
    DATABASE_URL: databaseUrl,
    SEED_OWNER_EMAIL: process.env.E2E_OWNER_EMAIL ?? defaults.ownerEmail,
    SEED_OWNER_PASSWORD: process.env.E2E_OWNER_PASSWORD ?? defaults.ownerPassword,
  },
});
