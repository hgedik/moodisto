import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_LEASE_STALE_AFTER_SECONDS } from '@moodisto/validation';
import { MAX_CONSECUTIVE_PLAYBACK_FAILURES } from '@moodisto/queue-engine';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createPendingRequests,
  createTracks,
  createVenueFixture,
  VENUE_PASSWORD,
  type VenueFixture,
} from './support/fixtures';

/**
 * The player tab renders; the server decides. These tests pin down that contract, including what
 * happens when a tab disappears without releasing its lease.
 */
describe('player lease and playback', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let admin: Client;
  let queuedTrackIds: string[];

  const login = async (email: string): Promise<Client> => {
    const client = await harness.client();
    await client.post('/api/auth/venue/login', { email, password: VENUE_PASSWORD }).expect(201);
    return client;
  };

  const queueSongs = async (count: number): Promise<void> => {
    queuedTrackIds = await createTracks(harness.prisma, count, 'lease');
    const requestIds = await createPendingRequests(harness.prisma, venue.venueId, queuedTrackIds);
    for (const id of requestIds) {
      await admin.post(`/api/venue/requests/${id}/accept`).expect(201);
    }
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
    admin = await login(venue.ownerEmail);
  });

  it('reports IDLE with nothing queued and refuses to invent a track', async () => {
    const state = await admin
      .post('/api/venue/player/start', { sessionId: 'player-tab-idle', takeover: true })
      .expect(201);

    expect(state.body.state).toBe('IDLE');
    expect(state.body.current).toBeNull();
    expect(state.body.upcoming).toHaveLength(0);
    expect(state.body.leaseOwned).toBe(true);
  });

  it('walks the whole queue one completion at a time', async () => {
    await queueSongs(3);
    const sessionId = 'player-tab-walk';

    let state = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);
    expect(state.body.state).toBe('PLAYING');
    expect(state.body.upcoming).toHaveLength(2);

    const played: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      played.push(state.body.current.track.id);
      state = await admin
        .post('/api/venue/player/complete', { sessionId, queueItemId: state.body.current.id })
        .expect(201);
    }

    expect(played).toEqual(queuedTrackIds);
    expect(state.body.state).toBe('IDLE');
    expect(state.body.current).toBeNull();

    const requests = await harness.prisma.songRequest.findMany({
      where: { venueId: venue.venueId },
    });
    expect(requests.every((entry) => entry.status === 'COMPLETED')).toBe(true);
    expect(requests.every((entry) => entry.completedAt !== null)).toBe(true);
  });

  it('marks an unplayable track FAILED and moves on', async () => {
    await queueSongs(2);
    const sessionId = 'player-tab-error';

    const started = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);
    const brokenItemId = started.body.current.id;

    const recovered = await admin
      .post('/api/venue/player/error', {
        sessionId,
        queueItemId: brokenItemId,
        code: 'EMBED_NOT_ALLOWED',
        message: 'Video gömülü oynatmaya kapalı.',
      })
      .expect(201);

    expect(recovered.body.state).toBe('PLAYING');
    expect(recovered.body.current.id).not.toBe(brokenItemId);
    expect(
      (await harness.prisma.queueItem.findUniqueOrThrow({ where: { id: brokenItemId } })).state,
    ).toBe('FAILED');
  });

  it('starts a song approved while the player was waiting with an empty queue', async () => {
    const sessionId = 'player-tab-waiting';
    const idle = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);
    expect(idle.body.state).toBe('IDLE');

    // The venue approves a request with the player tab already open and holding the lease.
    await queueSongs(1);

    const state = await admin.get(`/api/venue/player/state?sessionId=${sessionId}`).expect(200);
    expect(state.body.state).toBe('PLAYING');
    expect(state.body.current?.track.id).toBe(queuedTrackIds[0]);
  });

  it('leaves a newly approved song waiting when no player tab is listening', async () => {
    await queueSongs(1);

    const state = await admin.get('/api/venue/player/state').expect(200);
    expect(state.body.state).toBe('IDLE');
    expect(state.body.current).toBeNull();
    expect(state.body.upcoming).toHaveLength(1);
  });

  it('stops burning the queue once too many tracks fail in a row', async () => {
    // A catalogue the venue cannot embed used to drain the whole evening in one second: every
    // error advanced, the next track errored too, and the guests' requests were gone.
    await queueSongs(MAX_CONSECUTIVE_PLAYBACK_FAILURES + 2);
    const sessionId = 'player-tab-cascade';

    let state = await admin.post('/api/venue/player/start', { sessionId, takeover: true }).expect(201);

    for (let attempt = 0; attempt < MAX_CONSECUTIVE_PLAYBACK_FAILURES; attempt += 1) {
      state = await admin
        .post('/api/venue/player/error', {
          sessionId,
          queueItemId: state.body.current.id,
          code: 'EMBED_NOT_ALLOWED',
          message: 'Video gömülü oynatmaya kapalı.',
        })
        .expect(201);
    }

    expect(state.body.state).toBe('ERROR');
    expect(state.body.current).toBeNull();
    // Everything the venue has not tried yet is still waiting for it.
    expect(state.body.upcoming).toHaveLength(2);
    expect(
      await harness.prisma.queueItem.count({ where: { venueId: venue.venueId, state: 'QUEUED' } }),
    ).toBe(2);
    expect(
      await harness.prisma.queueItem.count({ where: { venueId: venue.venueId, state: 'FAILED' } }),
    ).toBe(MAX_CONSECUTIVE_PLAYBACK_FAILURES);
  });

  it('starts the failure budget over once a track reaches the speakers', async () => {
    await queueSongs(MAX_CONSECUTIVE_PLAYBACK_FAILURES + 2);
    const sessionId = 'player-tab-recovered';

    let state = await admin.post('/api/venue/player/start', { sessionId, takeover: true }).expect(201);

    for (let attempt = 0; attempt < MAX_CONSECUTIVE_PLAYBACK_FAILURES - 1; attempt += 1) {
      state = await admin
        .post('/api/venue/player/error', {
          sessionId,
          queueItemId: state.body.current.id,
          code: 'EMBED_NOT_ALLOWED',
          message: 'Video gömülü oynatmaya kapalı.',
        })
        .expect(201);
    }

    state = await admin
      .post('/api/venue/player/complete', { sessionId, queueItemId: state.body.current.id })
      .expect(201);

    const afterGoodTrack = await admin
      .post('/api/venue/player/error', {
        sessionId,
        queueItemId: state.body.current.id,
        code: 'EMBED_NOT_ALLOWED',
        message: 'Video gömülü oynatmaya kapalı.',
      })
      .expect(201);

    expect(afterGoodTrack.body.state).toBe('PLAYING');
    expect(afterGoodTrack.body.current).not.toBeNull();
  });

  it('picks the queue back up when the venue retries a halted player', async () => {
    await queueSongs(MAX_CONSECUTIVE_PLAYBACK_FAILURES + 1);
    const sessionId = 'player-tab-retry';

    let state = await admin.post('/api/venue/player/start', { sessionId, takeover: true }).expect(201);
    for (let attempt = 0; attempt < MAX_CONSECUTIVE_PLAYBACK_FAILURES; attempt += 1) {
      state = await admin
        .post('/api/venue/player/error', {
          sessionId,
          queueItemId: state.body.current.id,
          code: 'EMBED_NOT_ALLOWED',
          message: 'Video gömülü oynatmaya kapalı.',
        })
        .expect(201);
    }
    expect(state.body.state).toBe('ERROR');

    const retried = await admin.post('/api/venue/player/resume', { sessionId }).expect(201);

    expect(retried.body.state).toBe('PLAYING');
    expect(retried.body.current).not.toBeNull();
  });

  it('ignores a late completion for a track that is no longer current', async () => {
    await queueSongs(3);
    const sessionId = 'player-tab-late';

    const first = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);
    const staleItemId = first.body.current.id;

    const second = await admin
      .post('/api/venue/player/complete', { sessionId, queueItemId: staleItemId })
      .expect(201);
    const nowPlayingId = second.body.current.id;

    // A tab that woke up from a background throttle replays an old "ended" event.
    const late = await admin
      .post('/api/venue/player/complete', { sessionId, queueItemId: staleItemId })
      .expect(201);

    expect(late.body.current.id).toBe(nowPlayingId);
    expect(
      await harness.prisma.queueItem.count({
        where: { venueId: venue.venueId, state: 'COMPLETED' },
      }),
    ).toBe(1);
  });

  it('pauses and resumes without losing the current track', async () => {
    await queueSongs(2);
    const sessionId = 'player-tab-pause';
    const started = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);

    const paused = await admin.post('/api/venue/player/pause', { sessionId }).expect(201);
    expect(paused.body.state).toBe('PAUSED');
    expect(paused.body.current.id).toBe(started.body.current.id);

    const resumed = await admin.post('/api/venue/player/resume', { sessionId }).expect(201);
    expect(resumed.body.state).toBe('PLAYING');
    expect(resumed.body.current.id).toBe(started.body.current.id);
  });

  it('counts a skipped track as played', async () => {
    await queueSongs(2);
    const sessionId = 'player-tab-skip';
    const started = await admin
      .post('/api/venue/player/start', { sessionId, takeover: true })
      .expect(201);

    const skipped = await admin.post('/api/venue/player/next', { sessionId }).expect(201);

    expect(skipped.body.current.id).not.toBe(started.body.current.id);
    expect(
      (await harness.prisma.queueItem.findUniqueOrThrow({ where: { id: started.body.current.id } }))
        .state,
    ).toBe('COMPLETED');
  });

  it('lets a second tab take over explicitly, and only then', async () => {
    await queueSongs(2);
    const first = await login(venue.ownerEmail);
    const second = await login(venue.ownerEmail);

    await first.post('/api/venue/player/start', { sessionId: 'player-tab-aaaa' }).expect(201);

    const refused = await second.post('/api/venue/player/start', { sessionId: 'player-tab-bbbb' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('PLAYER_ALREADY_RUNNING');

    const takenOver = await second
      .post('/api/venue/player/start', { sessionId: 'player-tab-bbbb', takeover: true })
      .expect(201);
    expect(takenOver.body.leaseOwned).toBe(true);

    const lease = await harness.prisma.playerLease.findUniqueOrThrow({
      where: { venueId: venue.venueId },
    });
    expect(lease.sessionId).toBe('player-tab-bbbb');

    // The evicted tab must learn it is no longer the player.
    const evicted = await first
      .get('/api/venue/player/state?sessionId=player-tab-aaaa')
      .expect(200);
    expect(evicted.body.leaseOwned).toBe(false);
  });

  it('hands the lease to a new tab once the previous one goes stale', async () => {
    await queueSongs(1);
    await admin.post('/api/venue/player/start', { sessionId: 'player-tab-stale' }).expect(201);

    // Simulate a browser tab that was closed without releasing: heartbeats simply stop.
    await harness.prisma.playerLease.update({
      where: { venueId: venue.venueId },
      data: {
        lastHeartbeatAt: new Date(Date.now() - (PLAYER_LEASE_STALE_AFTER_SECONDS + 5) * 1000),
      },
    });

    const fresh = await login(venue.ownerEmail);
    const claimed = await fresh
      .post('/api/venue/player/start', { sessionId: 'player-tab-fresh' })
      .expect(201);
    expect(claimed.body.leaseOwned).toBe(true);
  });

  it('renews the lease on heartbeat and releases it on demand', async () => {
    await queueSongs(1);
    const sessionId = 'player-tab-heartbeat';
    await admin.post('/api/venue/player/start', { sessionId }).expect(201);

    const beat = await admin.post('/api/venue/player/heartbeat', { sessionId }).expect(201);
    expect(beat.body).toMatchObject({ sessionId, heldByCaller: true });
    expect(beat.body.staleAfterSeconds).toBe(PLAYER_LEASE_STALE_AFTER_SECONDS);

    const other = await admin
      .post('/api/venue/player/heartbeat', { sessionId: 'player-tab-intruder' })
      .expect(201);
    expect(other.body.heldByCaller).toBe(false);
    expect(other.body.sessionId).toBe(sessionId);

    await admin.post('/api/venue/player/release', { sessionId }).expect(201);
    expect(
      await harness.prisma.playerLease.findUnique({ where: { venueId: venue.venueId } }),
    ).toBeNull();
  });

  it('keeps the public now-playing view in step with the server state', async () => {
    await queueSongs(2);
    const sessionId = 'player-tab-public';
    const guest = await harness.client();

    const idle = await guest.get(`/api/venues/${venue.slug}/now-playing`).expect(200);
    expect(idle.body.state).toBe('IDLE');
    expect(idle.body.track).toBeNull();
    expect(idle.body.queueLength).toBe(2);

    await admin.post('/api/venue/player/start', { sessionId, takeover: true }).expect(201);

    const playing = await guest.get(`/api/venues/${venue.slug}/now-playing`).expect(200);
    expect(playing.body.state).toBe('PLAYING');
    expect(playing.body.track.id).toBe(queuedTrackIds[0]);
    expect(playing.body.queueLength).toBe(1);
  });
});
