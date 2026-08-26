import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createSystemUserFixture,
  createVenueFixture,
  SYSTEM_EMAIL,
  SYSTEM_PASSWORD,
  VENUE_PASSWORD,
} from './support/fixtures';

/**
 * The operator console is a second front door, not a back door into the venue one. These tests
 * hold the two sessions apart.
 */
describe('system authentication', () => {
  let harness: Harness;

  const login = async (email: string, password: string): Promise<Client> => {
    const client = await harness.client();
    await client.post('/api/auth/system/login', { email, password }).expect(201);
    return client;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await createSystemUserFixture(harness.prisma);
  });

  it('signs the operator in and back out', async () => {
    const client = await login(SYSTEM_EMAIL, SYSTEM_PASSWORD);

    const me = await client.get('/api/auth/system/me').expect(200);
    expect(me.body).toMatchObject({ email: SYSTEM_EMAIL, name: 'Sistem Yöneticisi' });
    expect(me.body.passwordHash).toBeUndefined();

    await client.post('/api/auth/system/logout').expect(201);
    await client.get('/api/auth/system/me').expect(401);
  });

  it('stamps the last login', async () => {
    await login(SYSTEM_EMAIL, SYSTEM_PASSWORD);

    const row = await harness.prisma.systemUser.findUniqueOrThrow({
      where: { email: SYSTEM_EMAIL },
    });
    expect(row.lastLoginAt).not.toBeNull();
  });

  it('answers the same way for a wrong password and an unknown account', async () => {
    const client = await harness.client();

    const wrongPassword = await client.post('/api/auth/system/login', {
      email: SYSTEM_EMAIL,
      password: 'definitely-not-the-password',
    });
    const unknown = await client.post('/api/auth/system/login', {
      email: 'nobody@example.com',
      password: 'definitely-not-the-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body.message).toBe(wrongPassword.body.message);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a deactivated operator', async () => {
    await harness.prisma.systemUser.update({
      where: { email: SYSTEM_EMAIL },
      data: { active: false },
    });
    const client = await harness.client();

    await client
      .post('/api/auth/system/login', { email: SYSTEM_EMAIL, password: SYSTEM_PASSWORD })
      .expect(401);
  });

  it('does not accept a venue session as a system session, or the other way round', async () => {
    const venue = await createVenueFixture(harness.prisma);
    const venueClient = await harness.client();
    await venueClient
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);

    await venueClient.get('/api/auth/system/me').expect(401);

    const systemClient = await login(SYSTEM_EMAIL, SYSTEM_PASSWORD);
    await systemClient.get('/api/auth/venue/me').expect(401);
  });

  it('refuses a login without the CSRF header', async () => {
    const client = await harness.client();

    const response = await client.agent
      .post('/api/auth/system/login')
      .send({ email: SYSTEM_EMAIL, password: SYSTEM_PASSWORD });

    expect(response.status).toBe(403);
  });
});

/**
 * The rest of the suite runs with limits off, so the login throttle needs an application of its
 * own compiled while the flag is on.
 */
describe('system login throttling', () => {
  let harness: Harness;
  let previousFlag: string | undefined;

  beforeEach(async () => {
    previousFlag = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = 'true';
    harness = await createHarness();
    await harness.reset();
    await createSystemUserFixture(harness.prisma);
  });

  afterEach(async () => {
    await harness.close();
    process.env.RATE_LIMIT_ENABLED = previousFlag;
  });

  it('stops guessing after ten attempts from one address', async () => {
    const client = await harness.client();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await client
        .post('/api/auth/system/login', { email: SYSTEM_EMAIL, password: 'wrong-password-123' })
        .expect(401);
    }

    const blocked = await client.post('/api/auth/system/login', {
      email: SYSTEM_EMAIL,
      password: SYSTEM_PASSWORD,
    });

    expect(blocked.status).toBe(429);
  });
});
