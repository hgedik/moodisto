import { defineConfig, devices } from '@playwright/test';
import { apiEnv, apiUrl, repoRoot, webEnv, webPort, webUrl } from './support/e2e-env';

const isCI = Boolean(process.env.CI);

/**
 * The suite owns the whole stack: `scripts/reset-e2e-database.mjs` prepares its database, then
 * these two servers come up on their own ports with their own environment. Nothing here reads the
 * developer's `.env`, so a local run cannot pick up a real provider key or a real payment account.
 *
 * One worker, because a venue has exactly one player lease and one queue: parallel workers would
 * be fighting over the same speakers.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webUrl,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    video: 'off',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  },
  projects: [
    {
      name: 'mobile-guest-and-desktop-console',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @moodisto/api exec nest start',
      cwd: repoRoot,
      url: `${apiUrl}/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // A production build, not the development server: the development bundler compiles a route
      // the first time it is requested and hydrates it afterwards, so a click can land on markup
      // that has no handlers attached yet. Building first also means the suite exercises the
      // Content-Security-Policy that actually ships, rather than the relaxed development one.
      command: `pnpm --filter @moodisto/web exec next build && pnpm --filter @moodisto/web exec next start --port ${webPort}`,
      cwd: repoRoot,
      url: webUrl,
      env: webEnv,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
