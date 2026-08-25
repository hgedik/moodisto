import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './support/harness';
import {
  createVenueFixture,
  FAKE_TRACK_IDS,
  VENUE_PASSWORD,
  type VenueFixture,
} from './support/fixtures';

describe('rate limiting', () => {
  let harness: Harness;
  let venue: VenueFixture;

  // Limits are counted per IP, and every supertest call arrives from the same loopback address.
  // A fresh application per test therefore keeps one test's budget out of the next one's.
  beforeEach(async () => {
    // The rest of the integration suite runs with limits off; the configuration is read when the
    // application module is compiled, so switching it on here is enough.
    process.env.RATE_LIMIT_ENABLED = 'true';
    harness = await createHarness();
    await harness.reset();
    venue = await createVenueFixture(harness.prisma);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stops a guest after five requests in ten minutes', async () => {
    const guest = await harness.client();
    const statuses: number[] = [];

    for (const providerTrackId of FAKE_TRACK_IDS) {
      const response = await guest.post(`/api/venues/${venue.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId,
        requestType: 'NORMAL',
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
    expect(await harness.prisma.songRequest.count()).toBe(5);
  });

  it('counts each guest separately', async () => {
    const first = await harness.client();
    const second = await harness.client();

    for (const providerTrackId of FAKE_TRACK_IDS.slice(0, 5)) {
      await first
        .post(`/api/venues/${venue.slug}/requests`, {
          provider: 'YOUTUBE',
          providerTrackId,
          requestType: 'NORMAL',
        })
        .expect(201);
    }
    await first
      .post(`/api/venues/${venue.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId: FAKE_TRACK_IDS[5],
        requestType: 'NORMAL',
      })
      .expect(429);

    // A different session is a different bucket, even from the same address.
    const other = await second.post(`/api/venues/${venue.slug}/requests`, {
      provider: 'YOUTUBE',
      providerTrackId: FAKE_TRACK_IDS[5],
      requestType: 'NORMAL',
    });
    expect(other.status).toBe(201);
  });

  it('caps provider searches at thirty a minute and says when to retry', async () => {
    const guest = await harness.client();

    for (let index = 0; index < 30; index += 1) {
      await guest.get(`/api/music/provider-search?q=arama-${index}`).expect(200);
    }

    const blocked = await guest.get('/api/music/provider-search?q=arama-30');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('lets the catalogue be searched far more freely than the provider', async () => {
    // Catalogue searches cost nothing, so the limit only exists to stop abuse. A guest correcting
    // a typo forty times must never be told to slow down for a search that never left the server.
    const guest = await harness.client();

    for (let index = 0; index < 40; index += 1) {
      await guest.get(`/api/music/search?q=yerel-${index}`).expect(200);
    }
  });

  it('throttles QR token guessing', async () => {
    const guest = await harness.client();
    const statuses: number[] = [];

    for (let index = 0; index < 21; index += 1) {
      const attempt = await guest.post(`/api/join/tahmin-edilen-token-${index}`);
      statuses.push(attempt.status);
    }

    expect(statuses.slice(0, 20).every((status) => status === 404)).toBe(true);
    expect(statuses[20]).toBe(429);

    // The throttle must not have been bypassed by a lucky guess.
    expect(await harness.prisma.customerSession.count({ where: { venueId: venue.venueId } })).toBe(
      0,
    );
  });

  it('throttles venue login attempts', async () => {
    const client = await harness.client();

    for (let index = 0; index < 10; index += 1) {
      await client
        .post('/api/auth/venue/login', { email: venue.ownerEmail, password: 'yanlis-sifre-000' })
        .expect(401);
    }

    const blocked = await client.post('/api/auth/venue/login', {
      email: venue.ownerEmail,
      password: VENUE_PASSWORD,
    });
    expect(blocked.status).toBe(429);
  });
});
