import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Vitest runs with the package root as its working directory.
const databasePackage = resolve(process.cwd(), '../../packages/database');

/**
 * Brings the dedicated test database up to the committed migrations once per run. The suite never
 * touches the development database: it refuses to start without TEST_DATABASE_URL.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error(
      'TEST_DATABASE_URL tanımlı değil. `.env.example` dosyasını `.env` olarak kopyalayın ve ' +
        '`docker compose up -d` ile PostgreSQL’i başlatın.',
    );
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: databasePackage,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
