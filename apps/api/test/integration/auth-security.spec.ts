import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import { createVenueFixture, VENUE_PASSWORD, type VenueFixture } from './support/fixtures';

const cookieNames = (setCookie: string[] | string | undefined): string[] => {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((cookie) => cookie.split('=')[0] ?? '');
};

/** The value of a `name=value; Attr; Attr` cookie header. */
const cookieValue = (cookie: string): string =>
  cookie.split('=').slice(1).join('=').split(';')[0] ?? '';

const cookieFor = (setCookie: string[] | string | undefined, name: string): string => {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!found) {
    throw new Error(`${name} çerezi yayınlanmadı.`);
  }
  return found;
};

describe('authentication and transport security', () => {
  let harness: Harness;
  let venue: VenueFixture;

  const login = async (email: string, password = VENUE_PASSWORD): Promise<Client> => {
    const client = await harness.client();
    await client.post('/api/auth/venue/login', { email, password }).expect(201);
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
    venue = await createVenueFixture(harness.prisma);
  });

  it('issues the session as an HttpOnly cookie and never in the body', async () => {
    const client = await harness.client();
    const response = await client
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);

    const sessionCookie = cookieFor(response.headers['set-cookie'], 'moodisto_venue');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    // The JWT itself must not travel in the payload: a body the page can read is a token the
    // page can put in localStorage.
    expect(JSON.stringify(response.body)).not.toContain(cookieValue(sessionCookie));
    expect(response.body).toMatchObject({ email: venue.ownerEmail, role: 'OWNER' });
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('accessToken');

    // The CSRF cookie is deliberately readable — the tab has to echo it back in a header. It is
    // handed out once, to a browser that has none, so it is asserted on that first response.
    const firstVisit = await request(harness.app.getHttpServer()).get('/api/auth/session');
    expect(cookieFor(firstVisit.headers['set-cookie'], 'moodisto_csrf')).not.toContain('HttpOnly');
  });

  it('answers a wrong password exactly like an unknown account', async () => {
    const client = await harness.client();

    const wrongPassword = await client
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: 'yanlis-sifre-123' })
      .expect(401);
    const unknownAccount = await client
      .post('/api/auth/venue/login', { email: 'yok@example.com', password: VENUE_PASSWORD })
      .expect(401);

    expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(cookieNames(wrongPassword.headers['set-cookie'])).not.toContain('moodisto_venue');
  });

  it('stores venue passwords as argon2id hashes only', async () => {
    const stored = await harness.prisma.venueUser.findFirstOrThrow({
      where: { email: venue.ownerEmail },
    });
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(stored.passwordHash).not.toContain(VENUE_PASSWORD);
  });

  it('rejects a state-changing call that carries cookies but no CSRF header', async () => {
    const client = await login(venue.ownerEmail);

    const withoutHeader = await client.agent.post('/api/venue/player/release').send({
      sessionId: 'player-tab-0001',
    });

    expect(withoutHeader.status).toBe(403);
    expect(withoutHeader.body.code).toBe('CSRF_FAILED');

    // Knowing the cookie name is not enough; the value must match the one in the jar.
    const mismatched = await client.agent
      .post('/api/venue/player/release')
      .set('X-CSRF-Token', 'baska-bir-deger')
      .send({ sessionId: 'player-tab-0001' });
    expect(mismatched.status).toBe(403);
  });

  it('refuses venue routes without a session, and forged sessions too', async () => {
    const anonymous = await harness.client();
    await anonymous.get('/api/venue/requests').expect(401);
    await anonymous.get('/api/venue/queue').expect(401);
    await anonymous.get('/api/venue/stats').expect(401);

    const forged = await request(harness.app.getHttpServer())
      .get('/api/venue/requests')
      .set('Cookie', ['moodisto_venue=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.imzalanmamis']);
    expect(forged.status).toBe(401);
  });

  it('keeps a DJ out of owner-only settings', async () => {
    const dj = await login(venue.djEmail);

    expect((await dj.get('/api/venue/queue')).status).toBe(200);
    const denied = await dj.patch('/api/venue/settings', {
      name: 'Yeni Ad',
      timezone: 'Europe/Istanbul',
      active: true,
    });
    expect(denied.status).toBe(403);

    const pricingDenied = await dj.patch('/api/venue/pricing', {
      currency: 'TRY',
      duplicateCooldownMinutes: 30,
      options: [{ type: 'NORMAL', enabled: true, priceMinor: 0 }],
    });
    expect(pricingDenied.status).toBe(403);
  });

  it('logs out by clearing the session cookie', async () => {
    const client = await login(venue.ownerEmail);
    await client.get('/api/auth/venue/me').expect(200);

    const loggedOut = await client.post('/api/auth/venue/logout').expect(201);
    expect(cookieFor(loggedOut.headers['set-cookie'], 'moodisto_venue')).toMatch(
      /moodisto_venue=;/,
    );
    await client.get('/api/auth/venue/me').expect(401);
  });

  it('never lets a provider key reach the client through search', async () => {
    const client = await harness.client();
    const response = await client.get('/api/music/search?q=duman').expect(200);

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/apiKey|api_key|AIza/i);
    expect(
      response.body.results.every((result: { provider: string }) => result.provider === 'YOUTUBE'),
    ).toBe(true);
  });

  it('refuses a search that is too short to be worth a provider call', async () => {
    const client = await harness.client();
    await client.get('/api/music/search?q=du').expect(400);
    expect(await harness.prisma.musicSearchCache.count()).toBe(0);
  });

  it('serves the same search from cache the second time', async () => {
    const client = await harness.client();

    const first = await client.get('/api/music/search?q=teoman').expect(200);
    expect(first.body.cached).toBe(false);

    const second = await client.get('/api/music/search?q=%20TEOMAN%20').expect(200);
    // Normalisation means casing and padding must not cost a second provider call.
    expect(second.body.cached).toBe(true);
    expect(second.body.results).toEqual(first.body.results);
    expect(await harness.prisma.musicSearchCache.count()).toBe(1);
  });

  it('does not reveal a venue through an unknown QR token', async () => {
    const client = await harness.client();
    await client.post('/api/join/gecersiz-token-0123456789').expect(404);
  });

  it('reports database health without authentication', async () => {
    const response = await request(harness.app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
