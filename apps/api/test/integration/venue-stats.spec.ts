import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createPendingRequests,
  createTracks,
  createVenueFixture,
  VENUE_PASSWORD,
  type VenueFixture,
} from './support/fixtures';

const YESTERDAY = (): Date => new Date(Date.now() - 24 * 60 * 60 * 1000);

/**
 * "Onaylanan" counts a decision the venue made, not a status a request happens to be sitting in.
 * A song that was approved and then failed on the speakers was still approved.
 */
describe('venue statistics', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let admin: Client;

  const acceptTracks = async (count: number): Promise<string[]> => {
    const trackIds = await createTracks(harness.prisma, count, 'stats');
    const requestIds = await createPendingRequests(harness.prisma, venue.venueId, trackIds);
    for (const id of requestIds) {
      await admin.post(`/api/venue/requests/${id}/accept`).expect(201);
    }
    return requestIds;
  };

  const today = async (): Promise<Record<string, number>> =>
    (await admin.get('/api/venue/stats?period=today').expect(200)).body;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    venue = await createVenueFixture(harness.prisma);
    admin = await harness.client();
    await admin
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);
  });

  it('keeps counting the approvals whose playback later failed', async () => {
    await acceptTracks(3);
    const sessionId = 'stats-player-tab';

    let state = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);

    // Two tracks the browser could not play at all, one that reached the speakers.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      state = await admin
        .post('/api/venue/player/error', {
          sessionId,
          queueItemId: state.body.current.id,
          code: 'EMBED_NOT_ALLOWED',
          message: 'Video gömülü oynatmaya kapalı.',
        })
        .expect(201);
    }
    await admin
      .post('/api/venue/player/complete', { sessionId, queueItemId: state.body.current.id })
      .expect(201);

    expect(
      await harness.prisma.songRequest.count({
        where: { venueId: venue.venueId, status: 'FAILED' },
      }),
    ).toBe(2);

    const stats = await today();
    expect(stats.acceptedRequests).toBe(3);
    expect(stats.rejectedRequests).toBe(0);
  });

  it('counts a decision on the day it was made, not the day the request arrived', async () => {
    const trackIds = await createTracks(harness.prisma, 2, 'stats-old');
    const [acceptedId, rejectedId] = await createPendingRequests(
      harness.prisma,
      venue.venueId,
      trackIds,
    );
    if (acceptedId === undefined || rejectedId === undefined) {
      throw new Error('Fixture iki istek üretmeliydi.');
    }
    await harness.prisma.songRequest.updateMany({
      where: { id: { in: [acceptedId, rejectedId] } },
      data: { createdAt: YESTERDAY() },
    });

    await admin.post(`/api/venue/requests/${acceptedId}/accept`).expect(201);
    await admin
      .post(`/api/venue/requests/${rejectedId}/reject`, { reason: 'Bu akşam listeye uymuyor.' })
      .expect(201);

    const stats = await today();
    expect(stats.acceptedRequests).toBe(1);
    expect(stats.rejectedRequests).toBe(1);
    // Both requests arrived yesterday, so today's traffic is still zero.
    expect(stats.totalRequests).toBe(0);
  });

  it('leaves yesterday out of today and counts nothing twice', async () => {
    await acceptTracks(2);
    const stats = await today();

    expect(stats.totalRequests).toBe(2);
    expect(stats.acceptedRequests).toBe(2);
    expect(stats.rejectedRequests).toBe(0);
    expect(stats.queueLength).toBe(2);
  });
});
