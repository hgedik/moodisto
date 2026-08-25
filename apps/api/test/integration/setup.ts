/**
 * Points the API at the test database and pins the replaceable adapters to their deterministic
 * implementations before any module reads the environment.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL tanımlı değil.');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.MUSIC_PROVIDER_FAKE = 'true';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'integration-cookie-secret-value';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-jwt-secret-value';
// Rate limits have their own dedicated suite; leaving them on everywhere would make unrelated
// tests fail as soon as one of them sends a sixth request.
process.env.RATE_LIMIT_ENABLED = 'false';
