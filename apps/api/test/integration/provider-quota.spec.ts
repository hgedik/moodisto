import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quotaPeriodKey } from '@moodisto/queue-engine';
import { PROVIDER_QUOTA_REQUEST_RESERVE_UNITS } from '@moodisto/validation';
import { FAKE_QUOTA } from '../../src/music/fake-music-provider';
import { createHarness, type Client, type Harness } from './support/harness';
import { createVenueFixture, type VenueFixture } from './support/fixtures';

/**
 * The provider's daily allowance is the one resource Moodisto cannot buy its way out of, so the
 * rules around it are product rules: the free catalogue never closes, searching stops before the
 * allowance is gone, and whatever is held back belongs to guests who have already chosen a song.
 */
describe('provider quota', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let guest: Client;

  /** Units search may spend before it has to leave the rest for pending requests. */
  const searchCeiling = FAKE_QUOTA.dailyUnits - PROVIDER_QUOTA_REQUEST_RESERVE_UNITS;

  /** Winds the day's ledger forward to a given total, whatever it happens to read now. */
  const setSpend = async (spentUnits: number): Promise<void> => {
    const key = {
      provider: 'YOUTUBE' as const,
      periodKey: quotaPeriodKey(new Date(), FAKE_QUOTA.resetTimeZone),
    };
    await harness.prisma.providerQuotaUsage.upsert({
      where: { provider_periodKey: key },
      create: { ...key, spentUnits },
      update: { spentUnits },
    });
  };

  const spent = async (): Promise<number> => {
    const row = await harness.prisma.providerQuotaUsage.findFirst();
    return row?.spentUnits ?? 0;
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
  });

  it('tells the search screen how many provider searches are left', async () => {
    const answer = await guest.get('/api/music/search?q=dudu').expect(200);

    expect(answer.body.providerSearch.available).toBe(true);
    expect(answer.body.providerSearch.remainingSearches).toBe(
      Math.floor(searchCeiling / FAKE_QUOTA.searchUnits),
    );
    expect(answer.body.providerSearch.resetsInSeconds).toBeGreaterThan(0);
  });

  it('books the allowance once per query and never again for the same words', async () => {
    await guest.get('/api/music/provider-search?q=dudu').expect(200);
    expect(await spent()).toBe(FAKE_QUOTA.searchUnits);

    // The stored search cache answers the repeat, so the provider is never asked and nothing is
    // charged. The reworded query hits the same cache entry, which is the point of normalising.
    await guest.get('/api/music/provider-search?q=DUDU').expect(200);
    await guest.get('/api/music/provider-search?q=  dudu  ').expect(200);
    expect(await spent()).toBe(FAKE_QUOTA.searchUnits);

    await guest.get('/api/music/provider-search?q=cambaz').expect(200);
    expect(await spent()).toBe(FAKE_QUOTA.searchUnits * 2);
  });

  it('closes the provider door before the allowance runs out', async () => {
    await setSpend(searchCeiling - (FAKE_QUOTA.searchUnits - 1));

    const refused = await guest.get('/api/music/provider-search?q=teoman');
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('PROVIDER_QUOTA_EXHAUSTED');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    // Nothing was spent on the refusal, so the reserve is still whole.
    expect(await spent()).toBe(searchCeiling - (FAKE_QUOTA.searchUnits - 1));
  });

  it('keeps the catalogue answering with the door closed, and says so', async () => {
    await guest.get('/api/music/provider-search?q=dudu').expect(200);
    await setSpend(searchCeiling);

    const answer = await guest.get('/api/music/search?q=dudu').expect(200);

    expect(answer.body.source).toBe('catalogue');
    expect(answer.body.results.length).toBeGreaterThan(0);
    expect(answer.body.providerSearch).toMatchObject({
      available: false,
      remainingSearches: 0,
    });
  });

  it('spends the reserve on a guest who has already chosen a song', async () => {
    // Every last searchable unit is gone, and this track was never searched for, so sending the
    // request needs a provider lookup. That is exactly what the reserve was kept for.
    await setSpend(searchCeiling);

    const created = await guest
      .post(`/api/venues/${venue.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId: 'fake-papara',
        requestType: 'NORMAL',
      })
      .expect(201);

    expect(created.body.request.status).toBe('PENDING');
    expect(await spent()).toBe(searchCeiling + FAKE_QUOTA.trackLookupUnits);
  });

  it('refuses a lookup once even the reserve is gone', async () => {
    await setSpend(FAKE_QUOTA.dailyUnits);

    const refused = await guest.post(`/api/venues/${venue.slug}/requests`, {
      provider: 'YOUTUBE',
      providerTrackId: 'fake-papara',
      requestType: 'NORMAL',
    });

    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('PROVIDER_QUOTA_EXHAUSTED');
  });

  it('does not spend a lookup on a track the catalogue already knows', async () => {
    await guest.get('/api/music/provider-search?q=dudu').expect(200);
    const afterSearch = await spent();

    await guest
      .post(`/api/venues/${venue.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId: 'fake-dudu',
        requestType: 'NORMAL',
      })
      .expect(201);

    expect(await spent()).toBe(afterSearch);
  });
});
