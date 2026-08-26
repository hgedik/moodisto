import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import { createVenueFixture, VENUE_PASSWORD, type VenueFixture } from './support/fixtures';

describe('song request lifecycle', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let guest: Client;
  let admin: Client;

  const login = async (email: string): Promise<Client> => {
    const client = await harness.client();
    await client.post('/api/auth/venue/login', { email, password: VENUE_PASSWORD }).expect(201);
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
    guest = await harness.client();
    admin = await login(venue.ownerEmail);
  });

  const requestSong = (providerTrackId: string, requestType = 'NORMAL', client: Client = guest) =>
    client.post(`/api/venues/${venue.slug}/requests`, {
      provider: 'YOUTUBE',
      providerTrackId,
      requestType,
    });

  it('carries a guest from QR scan to a playing song', async () => {
    const joined = await guest.post(`/api/join/${venue.qrToken}`).expect(201);
    expect(joined.body.venue.slug).toBe(venue.slug);
    expect(joined.body.tableLabel).toBe(venue.tableLabel);

    // Nothing has been searched yet, so the local catalogue has nothing to offer and the guest
    // spends a provider search — exactly once, for everyone who comes after them.
    const cold = await guest.get(`/api/music/search?q=dudu&limit=5`).expect(200);
    expect(cold.body.source).toBe('catalogue');
    expect(cold.body.results).toEqual([]);

    const search = await guest.get(`/api/music/provider-search?q=dudu&limit=5`).expect(200);
    expect(search.body.source).toBe('provider');
    expect(search.body.results.length).toBeGreaterThan(0);
    const track = search.body.results[0];
    // The provider key never leaves the server: the client only sees provider + provider track id.
    expect(Object.keys(track)).not.toContain('youtubeVideoId');

    const created = await requestSong(track.providerTrackId).expect(201);
    expect(created.body.request.status).toBe('PENDING');
    // The table comes from the scanned QR code, not from anything the browser claimed.
    expect(created.body.request.tableLabel).toBe(venue.tableLabel);
    expect(created.body.payment).toBeNull();
    const requestId = created.body.request.id;

    const pending = await admin.get('/api/venue/requests?status=PENDING').expect(200);
    expect(pending.body.total).toBe(1);
    expect(pending.body.items.map((entry: { id: string }) => entry.id)).toContain(requestId);

    const accepted = await admin.post(`/api/venue/requests/${requestId}/accept`).expect(201);
    expect(accepted.body.status).toBe('QUEUED');

    const queue = await admin.get('/api/venue/queue').expect(200);
    expect(queue.body.upcoming).toHaveLength(1);
    expect(queue.body.upcoming[0].position).toBe(1);

    const started = await admin
      .post('/api/venue/player/start', { sessionId: 'player-tab-0001', takeover: true })
      .expect(201);
    expect(started.body.state).toBe('PLAYING');
    expect(started.body.current.track.providerTrackId).toBe(track.providerTrackId);
    expect(started.body.leaseOwned).toBe(true);

    const completed = await admin
      .post('/api/venue/player/complete', {
        sessionId: 'player-tab-0001',
        queueItemId: started.body.current.id,
      })
      .expect(201);
    expect(completed.body.state).toBe('IDLE');
    expect(completed.body.current).toBeNull();

    const finalRequest = await guest.get(`/api/requests/${requestId}`).expect(200);
    expect(finalRequest.body.status).toBe('COMPLETED');
  });

  it('rejects a request and records the reason', async () => {
    const created = await requestSong('fake-cambaz').expect(201);
    const requestId = created.body.request.id;

    const rejected = await admin
      .post(`/api/venue/requests/${requestId}/reject`, { reason: 'Bu akşam listemize uymuyor.' })
      .expect(201);

    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body.rejectionReason).toBe('Bu akşam listemize uymuyor.');
    expect((await admin.get('/api/venue/queue').expect(200)).body.upcoming).toHaveLength(0);
  });

  it('refuses the same track twice inside the venue cooldown', async () => {
    await requestSong('SCZgGVqVsbY').expect(201);

    const duplicate = await requestSong('SCZgGVqVsbY').expect(409);
    expect(duplicate.body.code).toBe('ALREADY_IN_QUEUE');
  });

  it('refuses a track the venue has blocked', async () => {
    await admin.post('/api/venue/filters', { type: 'KEYWORD', value: 'cambaz' }).expect(201);

    const blocked = await requestSong('fake-cambaz').expect(422);
    expect(blocked.body.code).toBe('TRACK_BLOCKED');
  });

  it('lets the requesting guest cancel, but nobody else', async () => {
    const created = await requestSong('fake-papara').expect(201);
    const requestId = created.body.request.id;

    const stranger = await harness.client();
    await stranger.post(`/api/requests/${requestId}/cancel`).expect(403);
    await stranger.get(`/api/requests/${requestId}`).expect(403);

    const cancelled = await guest.post(`/api/requests/${requestId}/cancel`).expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('keeps one venue out of another venue’s moderation queue', async () => {
    const other = await createVenueFixture(harness.prisma);
    const otherAdmin = await login(other.ownerEmail);

    const created = await requestSong('fake-yaslanmadan').expect(201);

    await otherAdmin.post(`/api/venue/requests/${created.body.request.id}/accept`).expect(404);
    expect((await otherAdmin.get('/api/venue/requests').expect(200)).body.items).toHaveLength(0);
  });

  it('places a play-next request ahead of the waiting normal ones', async () => {
    const first = await requestSong('SCZgGVqVsbY').expect(201);
    const second = await requestSong('fake-cambaz').expect(201);
    await admin.post(`/api/venue/requests/${first.body.request.id}/accept`).expect(201);
    await admin.post(`/api/venue/requests/${second.body.request.id}/accept`).expect(201);

    // Free the play-next tier so the queueing rule can be tested without a payment round trip.
    await admin
      .patch('/api/venue/pricing', {
        currency: 'TRY',
        duplicateCooldownMinutes: 30,
        options: [
          { type: 'NORMAL', enabled: true, priceMinor: 0 },
          { type: 'PRIORITY', enabled: true, priceMinor: 0 },
          { type: 'DJ', enabled: true, priceMinor: 0 },
          { type: 'PLAY_NEXT', enabled: true, priceMinor: 0 },
        ],
      })
      .expect(200);

    const urgent = await requestSong('fake-papara', 'PLAY_NEXT').expect(201);
    await admin.post(`/api/venue/requests/${urgent.body.request.id}/accept`).expect(201);

    const queue = await admin.get('/api/venue/queue').expect(200);
    expect(queue.body.upcoming.map((entry: { requestType: string }) => entry.requestType)).toEqual([
      'PLAY_NEXT',
      'NORMAL',
      'NORMAL',
    ]);
    expect(queue.body.upcoming.map((entry: { position: number }) => entry.position)).toEqual([
      1, 2, 3,
    ]);
  });
});
