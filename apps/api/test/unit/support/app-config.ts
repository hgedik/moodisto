import type { AppConfig } from '../../../src/config/app-config';

/** Deep-partial override helper so each test states only the configuration it cares about. */
export const testAppConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  nodeEnv: 'test',
  isProduction: false,
  port: 3001,
  appUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3001',
  corsOrigins: ['http://localhost:3000'],
  databaseUrl: 'postgresql://moodisto:moodisto@localhost:5433/moodisto_test?schema=public',
  cookieSecret: 'test-cookie-secret-at-least-16',
  settingsEncryptionKey: 'test-settings-encryption-key-32ch',
  jwt: {
    secret: 'test-jwt-secret-at-least-16-chars',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
  },
  music: {
    providerId: 'YOUTUBE',
    useFakeProvider: true,
    youtubeApiKey: '',
    youtubeRegionCode: 'TR',
    youtubeRelevanceLanguage: 'tr',
  },
  payment: {
    provider: 'mock',
    apiKey: 'test-api-key',
    secret: 'test-payment-secret',
    baseUrl: 'https://sandbox-api.iyzipay.com',
    webhookSecret: 'test-webhook-secret',
  },
  features: { paidRequests: true, youtubePlayback: true, rateLimit: true },
  ...overrides,
});
