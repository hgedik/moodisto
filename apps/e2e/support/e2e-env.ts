import path from 'node:path';
import defaults from '../e2e.config.json';

/**
 * Everything the suite needs to stand up an isolated stack.
 *
 * The run never touches the development database, the development ports or a real music provider:
 * it owns its own database, its own two servers and an offline catalogue. `e2e.config.json` holds
 * the defaults so that `scripts/reset-e2e-database.mjs` and the tests cannot drift apart; every
 * value can still be overridden to point the same suite at a CI stack.
 */
const number = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const repoRoot = path.resolve(__dirname, '..', '..', '..');

export const webPort = number(process.env.E2E_WEB_PORT, defaults.webPort);
export const apiPort = number(process.env.E2E_API_PORT, defaults.apiPort);
export const webUrl = `http://localhost:${webPort}`;
export const apiUrl = `http://localhost:${apiPort}`;

export const databaseUrl = process.env.E2E_DATABASE_URL ?? defaults.databaseUrl;
export const venueSlug = defaults.venueSlug;

/** Seeded by `packages/database/prisma/seed.ts` before the servers start. */
export const owner = {
  email: process.env.E2E_OWNER_EMAIL ?? defaults.ownerEmail,
  password: process.env.E2E_OWNER_PASSWORD ?? defaults.ownerPassword,
};

/** The operator of the installation, seeded alongside the venue accounts. */
export const systemUser = {
  email: process.env.E2E_SYSTEM_EMAIL ?? defaults.systemEmail,
  password: process.env.E2E_SYSTEM_PASSWORD ?? defaults.systemPassword,
};

/**
 * What each scenario asks for, and how far it has to reach to find it.
 *
 * Every scenario owns a track of its own, because the database is prepared once per run: a request
 * one spec leaves behind still occupies its track when the next spec starts, and the venue refuses
 * the same track twice.
 *
 * `free` is a seeded track, so typing finds it in the local catalogue — the seed leaves it played
 * out rather than waiting, which is what makes it free to ask for again. `paid` and `qr` exist only
 * in `apps/api/src/music/fake-music-provider.ts`, so those two also walk the guest through the
 * explicit provider search — the path that costs quota.
 */
export const catalogue = {
  free: { query: 'Senfoni', title: 'Yalnızlık Senfonisi' },
  paid: { query: 'Bir Derdim', title: 'Bir Derdim Var' },
  qr: { query: 'Papara', title: 'Papara' },
} as const;

/**
 * The API's environment for the run.
 *
 * The fake provider keeps the suite off the network and off the YouTube quota, the mock payment
 * provider makes checkout deterministic, and rate limiting is off because a scripted guest sends
 * requests far faster than a human one.
 */
export const apiEnv: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: databaseUrl,
  API_PORT: String(apiPort),
  API_URL: apiUrl,
  APP_URL: webUrl,
  CORS_ORIGINS: webUrl,
  COOKIE_SECRET: 'e2e-cookie-secret-value-32-characters',
  JWT_SECRET: 'e2e-jwt-secret-value-32-characters-long',
  MUSIC_PROVIDER: 'YOUTUBE',
  MUSIC_PROVIDER_FAKE: 'true',
  YOUTUBE_API_KEY: '',
  PAYMENT_PROVIDER: 'mock',
  PAYMENT_WEBHOOK_SECRET: 'e2e-payment-webhook-secret',
  ENABLE_PAID_REQUESTS: 'true',
  RATE_LIMIT_ENABLED: 'false',
};

/**
 * The web app's environment for the run.
 *
 * `NEXT_PUBLIC_PLAYER_STUB` swaps the provider embed for a stand-in with explicit "track ended"
 * and "playback failed" controls, so the queue can be driven forward without an external embed.
 */
export const webEnv: Record<string, string> = {
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_APP_URL: webUrl,
  NEXT_PUBLIC_PLAYER_STUB: '1',
};
