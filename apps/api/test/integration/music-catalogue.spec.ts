import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createPendingRequests,
  createVenueFixture,
  VENUE_PASSWORD,
  type VenueFixture,
} from './support/fixtures';

/**
 * Provider search is the only thing in Moodisto that costs external quota, so what the catalogue
 * remembers is a business concern, not an optimisation detail. These tests pin down what a search
 * leaves behind for the next guest to reuse.
 */
describe('music catalogue', () => {
  let harness: Harness;
  let guest: Client;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    guest = await harness.client();
  });

  it('stores a diacritic-folded search text for every track a search returns', async () => {
    await guest.get('/api/music/provider-search?q=tarkan').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'SCZgGVqVsbY' },
    });
    // "Dudu" by "Tarkan" on the "Tarkan" channel: the artist is kept once, not three times.
    expect(track.searchText).toBe('dudu tarkan');
  });

  it('folds the search text so a guest typing without diacritics still matches', async () => {
    await guest.get('/api/music/provider-search?q=yaslanmadan').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'fake-yaslanmadan' },
    });
    expect(track.searchText).toBe('yaslanmadan duman');
  });

  it('refreshes the search text of a track stored before the rule changed', async () => {
    await guest.get('/api/music/provider-search?q=tarkan').expect(200);
    await harness.prisma.track.updateMany({
      where: { providerTrackId: 'SCZgGVqVsbY' },
      data: { searchText: 'eski deger' },
    });

    await guest.get('/api/music/provider-search?q=dudu').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'SCZgGVqVsbY' },
    });
    expect(track.searchText).toBe('dudu tarkan');
  });
});

describe('catalogue search', () => {
  let harness: Harness;
  let guest: Client;

  /** Warms the catalogue the way a real guest would: one explicit provider search. */
  const warmCatalogue = async (query: string): Promise<void> => {
    await guest.get(`/api/music/provider-search?q=${encodeURIComponent(query)}`).expect(200);
  };

  const catalogue = async (query: string, venueId?: string) => {
    const suffix = venueId === undefined ? '' : `&venueId=${venueId}`;
    return guest.get(`/api/music/search?q=${encodeURIComponent(query)}${suffix}`).expect(200);
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    guest = await harness.client();
  });

  it('answers from the catalogue without spending provider quota', async () => {
    await warmCatalogue('tarkan');

    const response = await catalogue('tarkan');

    expect(response.body.source).toBe('catalogue');
    expect(
      response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId),
    ).toContain('SCZgGVqVsbY');
    // A provider search always leaves a cache row behind. One row means only the warm-up ran.
    expect(await harness.prisma.musicSearchCache.count()).toBe(1);
  });

  it('finds the track when the guest types the words in the other order', async () => {
    // This is the case a query-keyed cache cannot serve: same song, different wording, full price.
    await warmCatalogue('tarkan');

    const response = await catalogue('dudu tarkan');

    expect(
      response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId),
    ).toEqual(['SCZgGVqVsbY']);
    expect(await harness.prisma.musicSearchCache.count()).toBe(1);
  });

  it('matches a word the guest has not finished typing', async () => {
    await warmCatalogue('duman');

    const response = await catalogue('yasl');

    expect(
      response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId),
    ).toContain('fake-yaslanmadan');
  });

  it('finds a track whose diacritics the guest did not type', async () => {
    await warmCatalogue('athena');

    const response = await catalogue('boyleyim');

    expect(
      response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId),
    ).toContain('fake-ben-boyleyim');
  });

  it('stays empty on a cold catalogue instead of reaching for the provider', async () => {
    const response = await catalogue('tarkan');

    expect(response.body.results).toEqual([]);
    expect(await harness.prisma.musicSearchCache.count()).toBe(0);
  });

  it('never offers a track the provider itself refused to play', async () => {
    await warmCatalogue('tarkan');
    await harness.prisma.track.updateMany({
      where: { providerTrackId: 'SCZgGVqVsbY' },
      data: { playbackBlockedAt: new Date() },
    });

    const response = await catalogue('dudu');

    expect(response.body.results).toEqual([]);
  });

  it('puts a track that has played through above one that never has', async () => {
    await warmCatalogue('tarkan');
    await warmCatalogue('teoman');
    // Both tracks match "a" equally badly; what separates them is that one is known to work.
    await harness.prisma.track.updateMany({
      where: { providerTrackId: 'fake-papara' },
      data: { searchText: 'dudu teoman', lastPlayedOkAt: new Date() },
    });

    const response = await catalogue('dudu');

    expect(response.body.results[0].providerTrackId).toBe('fake-papara');
  });

  it('hides a track the venue blocked, exactly as provider search does', async () => {
    const venue: VenueFixture = await createVenueFixture(harness.prisma);
    await warmCatalogue('tarkan');
    await harness.prisma.blockedMusicRule.create({
      data: { venueId: venue.venueId, type: 'KEYWORD', value: 'tarkan' },
    });

    const response = await catalogue('dudu', venue.venueId);

    expect(response.body.results).toEqual([]);
  });
});

/**
 * The catalogue only pays for itself if it stays honest about what actually plays. Playback is the
 * one place Moodisto learns that, so these tests pin down which failures are the track's fault and
 * which are only this venue's.
 */
describe('catalogue playability feedback', () => {
  let harness: Harness;
  let guest: Client;
  let admin: Client;
  let venue: VenueFixture;

  const SESSION_ID = 'player-tab-catalogue';

  /** Warms the catalogue, then puts the requested track on the speakers of this venue. */
  const playTrack = async (
    providerTrackId: string,
  ): Promise<{ trackId: string; itemId: string }> => {
    await guest.get('/api/music/provider-search?q=tarkan').expect(200);
    const track = await harness.prisma.track.findFirstOrThrow({ where: { providerTrackId } });
    const [requestId] = await createPendingRequests(harness.prisma, venue.venueId, [track.id]);
    await admin.post(`/api/venue/requests/${requestId}/accept`).expect(201);
    const started = await admin
      .post('/api/venue/player/start', { sessionId: SESSION_ID, takeover: true })
      .expect(201);
    return { trackId: track.id, itemId: started.body.current.id };
  };

  const catalogueIds = async (query: string): Promise<string[]> => {
    const response = await guest.get(`/api/music/search?q=${query}`).expect(200);
    return response.body.results.map(
      (result: { providerTrackId: string }) => result.providerTrackId,
    );
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    guest = await harness.client();
    venue = await createVenueFixture(harness.prisma);
    admin = await harness.client();
    await admin
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);
  });

  it('marks a track that played through as proven', async () => {
    const { trackId, itemId } = await playTrack('SCZgGVqVsbY');

    await admin
      .post('/api/venue/player/complete', { sessionId: SESSION_ID, queueItemId: itemId })
      .expect(201);

    const track = await harness.prisma.track.findUniqueOrThrow({ where: { id: trackId } });
    expect(track.lastPlayedOkAt).not.toBeNull();
  });

  it('drops a track the provider itself refused out of the catalogue', async () => {
    const { trackId, itemId } = await playTrack('SCZgGVqVsbY');

    await admin
      .post('/api/venue/player/error', {
        sessionId: SESSION_ID,
        queueItemId: itemId,
        code: 'EMBED_NOT_ALLOWED',
        message: 'Video gömülü oynatmaya kapalı.',
      })
      .expect(201);

    const track = await harness.prisma.track.findUniqueOrThrow({ where: { id: trackId } });
    expect(track.playbackBlockedAt).not.toBeNull();
    // Nobody should be offered it again, at this venue or any other.
    expect(await catalogueIds('dudu')).not.toContain('SCZgGVqVsbY');
  });

  it('keeps a track whose failure was only about this venue', async () => {
    const { trackId, itemId } = await playTrack('SCZgGVqVsbY');

    await admin
      .post('/api/venue/player/error', {
        sessionId: SESSION_ID,
        queueItemId: itemId,
        code: 'NETWORK_ERROR',
        message: 'Ağ bağlantısı koptu.',
      })
      .expect(201);

    const track = await harness.prisma.track.findUniqueOrThrow({ where: { id: trackId } });
    // A dropped connection at one café says nothing about the track, so the shared catalogue
    // must not shrink for everyone else.
    expect(track.playbackBlockedAt).toBeNull();
    expect(await catalogueIds('dudu')).toContain('SCZgGVqVsbY');
  });

  it('takes a blocked track back once it plays through somewhere', async () => {
    const { trackId, itemId } = await playTrack('SCZgGVqVsbY');
    await harness.prisma.track.update({
      where: { id: trackId },
      data: { playbackBlockedAt: new Date() },
    });
    expect(await catalogueIds('dudu')).not.toContain('SCZgGVqVsbY');

    await admin
      .post('/api/venue/player/complete', { sessionId: SESSION_ID, queueItemId: itemId })
      .expect(201);

    // The provider changed its mind, or the block was wrong; either way the evidence is newer.
    const track = await harness.prisma.track.findUniqueOrThrow({ where: { id: trackId } });
    expect(track.playbackBlockedAt).toBeNull();
    expect(await catalogueIds('dudu')).toContain('SCZgGVqVsbY');
  });
});
