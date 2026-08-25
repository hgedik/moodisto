import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createPendingRequests,
  createTracks,
  createVenueFixture,
  VENUE_PASSWORD,
  type VenueFixture,
} from './support/fixtures';

/**
 * These tests are the reason the queue mutations sit behind `venues.lockForUpdate` inside a
 * transaction. They fail loudly the moment a read-modify-write escapes that lock.
 */
describe('queue under concurrency', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let admin: Client;

  const login = async (email: string): Promise<Client> => {
    const client = await harness.client();
    await client.post('/api/auth/venue/login', { email, password: VENUE_PASSWORD }).expect(201);
    return client;
  };

  const activeQueueRows = () =>
    harness.prisma.queueItem.findMany({
      where: { venueId: venue.venueId, state: { in: ['QUEUED', 'PLAYING'] } },
      orderBy: { position: 'asc' },
    });

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    venue = await createVenueFixture(harness.prisma);
    admin = await login(venue.ownerEmail);
  });

  it('gives 20 simultaneously accepted requests unique, gapless positions', async () => {
    const trackIds = await createTracks(harness.prisma, 20, 'concurrent');
    const requestIds = await createPendingRequests(harness.prisma, venue.venueId, trackIds);

    const responses = await Promise.all(
      requestIds.map((id) => admin.post(`/api/venue/requests/${id}/accept`)),
    );

    expect(responses.map((response) => response.status)).toEqual(requestIds.map(() => 201));
    expect(responses.every((response) => response.body.status === 'QUEUED')).toBe(true);

    const rows = await activeQueueRows();
    expect(rows).toHaveLength(20);
    // Gapless 1..20: a lost update would repeat a position and leave a hole at the end.
    expect(rows.map((row) => row.position)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(new Set(rows.map((row) => row.songRequestId)).size).toBe(20);
  });

  it('never lets two accepted requests share a position when tiers race each other', async () => {
    const trackIds = await createTracks(harness.prisma, 12, 'mixed');
    const normalIds = await createPendingRequests(
      harness.prisma,
      venue.venueId,
      trackIds.slice(0, 6),
      'NORMAL',
    );
    const urgentIds = await createPendingRequests(
      harness.prisma,
      venue.venueId,
      trackIds.slice(6),
      'PLAY_NEXT',
    );

    // Interleaved so the two insertion strategies (append vs. jump the line) collide.
    const interleaved = normalIds.flatMap((id, index) => [id, urgentIds[index]]);
    await Promise.all(
      interleaved.map((id) => admin.post(`/api/venue/requests/${id}/accept`).expect(201)),
    );

    const rows = await activeQueueRows();
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.position)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    const urgentSet = new Set(urgentIds);
    const urgentPositions = rows
      .filter((row) => urgentSet.has(row.songRequestId))
      .map((row) => row.position);
    // Priority tiers must all sit ahead of every waiting normal request.
    expect(Math.max(...urgentPositions)).toBeLessThan(
      Math.min(
        ...rows.filter((row) => !urgentSet.has(row.songRequestId)).map((row) => row.position),
      ),
    );
  });

  it('starts exactly one track when many player tabs claim the venue at once', async () => {
    const trackIds = await createTracks(harness.prisma, 5, 'player-race');
    const requestIds = await createPendingRequests(harness.prisma, venue.venueId, trackIds);
    for (const id of requestIds) {
      await admin.post(`/api/venue/requests/${id}/accept`).expect(201);
    }

    const tabs = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        login(venue.ownerEmail).then((client) => ({
          client,
          sessionId: `player-tab-${String(index).padStart(4, '0')}`,
        })),
      ),
    );

    const results = await Promise.all(
      tabs.map(({ client, sessionId }) =>
        client.post('/api/venue/player/start', { sessionId, takeover: false }),
      ),
    );

    // Losers are rejected with a conflict rather than silently taking over the speakers.
    const winners = results.filter((response) => response.status === 201);
    expect(winners).toHaveLength(1);
    expect(results.filter((response) => response.status === 409)).toHaveLength(5);

    const playing = await harness.prisma.queueItem.findMany({
      where: { venueId: venue.venueId, state: 'PLAYING' },
    });
    expect(playing).toHaveLength(1);

    const leases = await harness.prisma.playerLease.findMany({ where: { venueId: venue.venueId } });
    expect(leases).toHaveLength(1);
  });

  it('advances only once when the same finished track is reported twice', async () => {
    const trackIds = await createTracks(harness.prisma, 3, 'double-complete');
    const requestIds = await createPendingRequests(harness.prisma, venue.venueId, trackIds);
    for (const id of requestIds) {
      await admin.post(`/api/venue/requests/${id}/accept`).expect(201);
    }

    const sessionId = 'player-tab-double';
    const started = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);
    const finishedItemId = started.body.current.id;

    const [first, second] = await Promise.all([
      admin.post('/api/venue/player/complete', { sessionId, queueItemId: finishedItemId }),
      admin.post('/api/venue/player/complete', { sessionId, queueItemId: finishedItemId }),
    ]);

    // A duplicated "track ended" event must not eat two songs.
    const accepted = [first, second].filter((response) => response.status === 201);
    expect(accepted.length).toBeGreaterThanOrEqual(1);

    const completed = await harness.prisma.queueItem.count({
      where: { venueId: venue.venueId, state: 'COMPLETED' },
    });
    expect(completed).toBe(1);
    expect(
      await harness.prisma.queueItem.count({ where: { venueId: venue.venueId, state: 'PLAYING' } }),
    ).toBe(1);
  });
});
