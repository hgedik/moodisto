import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import { createVenueFixture, type VenueFixture } from './support/fixtures';

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
      where: { providerTrackId: 'fake-dudu' },
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
      where: { providerTrackId: 'fake-dudu' },
      data: { searchText: 'eski deger' },
    });

    await guest.get('/api/music/provider-search?q=dudu').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'fake-dudu' },
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

  const catalogue = async (query: string, venueId?: string): Promise<Client['get'] extends never ? never : any> => {
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
    expect(response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId))
      .toContain('fake-dudu');
    // A provider search always leaves a cache row behind. One row means only the warm-up ran.
    expect(await harness.prisma.musicSearchCache.count()).toBe(1);
  });

  it('finds the track when the guest types the words in the other order', async () => {
    // This is the case a query-keyed cache cannot serve: same song, different wording, full price.
    await warmCatalogue('tarkan');

    const response = await catalogue('dudu tarkan');

    expect(response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId))
      .toEqual(['fake-dudu']);
    expect(await harness.prisma.musicSearchCache.count()).toBe(1);
  });

  it('matches a word the guest has not finished typing', async () => {
    await warmCatalogue('duman');

    const response = await catalogue('yasl');

    expect(response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId))
      .toContain('fake-yaslanmadan');
  });

  it('finds a track whose diacritics the guest did not type', async () => {
    await warmCatalogue('athena');

    const response = await catalogue('boyleyim');

    expect(response.body.results.map((result: { providerTrackId: string }) => result.providerTrackId))
      .toContain('fake-ben-boyleyim');
  });

  it('stays empty on a cold catalogue instead of reaching for the provider', async () => {
    const response = await catalogue('tarkan');

    expect(response.body.results).toEqual([]);
    expect(await harness.prisma.musicSearchCache.count()).toBe(0);
  });

  it('never offers a track the provider itself refused to play', async () => {
    await warmCatalogue('tarkan');
    await harness.prisma.track.updateMany({
      where: { providerTrackId: 'fake-dudu' },
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
