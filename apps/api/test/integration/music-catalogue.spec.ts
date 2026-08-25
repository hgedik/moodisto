import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';

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
    await guest.get('/api/music/search?q=tarkan').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'fake-dudu' },
    });
    // "Dudu" by "Tarkan" on the "Tarkan" channel: the artist is kept once, not three times.
    expect(track.searchText).toBe('dudu tarkan');
  });

  it('folds the search text so a guest typing without diacritics still matches', async () => {
    await guest.get('/api/music/search?q=yaslanmadan').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'fake-yaslanmadan' },
    });
    expect(track.searchText).toBe('yaslanmadan duman');
  });

  it('refreshes the search text of a track stored before the rule changed', async () => {
    await guest.get('/api/music/search?q=tarkan').expect(200);
    await harness.prisma.track.updateMany({
      where: { providerTrackId: 'fake-dudu' },
      data: { searchText: 'eski deger' },
    });

    await guest.get('/api/music/search?q=dudu').expect(200);

    const track = await harness.prisma.track.findFirstOrThrow({
      where: { providerTrackId: 'fake-dudu' },
    });
    expect(track.searchText).toBe('dudu tarkan');
  });
});
