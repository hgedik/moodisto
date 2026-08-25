import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicProviderId } from '@moodisto/shared-types';
import { CachedMusicProvider } from '../src/cache/cached-music-provider';
import type { MusicProvider, MusicSearchCache, TrackSearchResult } from '../src/ports';

const result: TrackSearchResult = {
  provider: MusicProviderId.YOUTUBE,
  providerTrackId: 'abc123',
  title: 'Dudu',
  artist: 'Tarkan',
  channelName: 'Tarkan Official',
  channelId: 'UC-tarkan',
  thumbnailUrl: null,
  durationSeconds: 222,
};

const createInnerProvider = (): MusicProvider => ({
  id: MusicProviderId.YOUTUBE,
  capabilities: {
    supportsPaidRequests: false,
    requiresVisiblePlayer: true,
    allowsAudioOnlyPlayback: false,
    allowsBackgroundPlayback: false,
    complianceNotes: [],
  },
  quota: {
    dailyUnits: 10_000,
    searchUnits: 101,
    trackLookupUnits: 1,
    resetTimeZone: 'America/Los_Angeles',
  },
  search: vi.fn(async () => [result]),
  getTrack: vi.fn(async () => ({ ...result, metadata: {} })),
  getPlaybackSource: vi.fn(async () => ({
    kind: 'EMBEDDED_IFRAME' as const,
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'abc123',
    origin: null,
  })),
});

const createCache = (): MusicSearchCache & { store: Map<string, TrackSearchResult[]> } => {
  const store = new Map<string, TrackSearchResult[]>();
  return {
    store,
    read: vi.fn(async (provider, query) => store.get(`${provider}:${query}`) ?? null),
    write: vi.fn(async (provider, query, results) => {
      store.set(`${provider}:${query}`, [...results]);
    }),
  };
};

describe('CachedMusicProvider', () => {
  let inner: MusicProvider;
  let cache: ReturnType<typeof createCache>;
  let provider: CachedMusicProvider;

  beforeEach(() => {
    inner = createInnerProvider();
    cache = createCache();
    provider = new CachedMusicProvider(inner, cache, { ttlSeconds: 86_400 });
  });

  it('calls the provider on a cache miss and stores the outcome', async () => {
    const results = await provider.search('Tarkan   Dudu', { limit: 10 });

    expect(results).toEqual([result]);
    expect(inner.search).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledWith(
      MusicProviderId.YOUTUBE,
      'tarkan dudu',
      [result],
      86_400,
    );
  });

  it('serves a cache hit without spending provider quota', async () => {
    await provider.search('Tarkan Dudu', { limit: 10 });
    await provider.search('  tarkan   dudu  ', { limit: 10 });

    expect(inner.search).toHaveBeenCalledTimes(1);
  });

  it('normalises with Turkish casing so that different casings share one cache entry', async () => {
    await provider.search('İSTANBUL', { limit: 10 });
    await provider.search('istanbul', { limit: 10 });

    expect(inner.search).toHaveBeenCalledTimes(1);
  });

  it('keeps diacritically different queries in separate cache entries', async () => {
    await provider.search('kız', { limit: 10 });
    await provider.search('kiz', { limit: 10 });

    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('reports whether the last search was served from cache', async () => {
    expect((await provider.searchWithCacheInfo('tarkan', { limit: 10 })).cached).toBe(false);
    expect((await provider.searchWithCacheInfo('tarkan', { limit: 10 })).cached).toBe(true);
  });

  it('does not cache an empty result set so a transient miss is retried', async () => {
    (inner.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await provider.search('bilinmeyen sarki', { limit: 10 });
    await provider.search('bilinmeyen sarki', { limit: 10 });

    expect(inner.search).toHaveBeenCalledTimes(2);
  });

  it('delegates track and playback lookups untouched', async () => {
    await provider.getTrack('abc123');
    await provider.getPlaybackSource('abc123');

    expect(inner.getTrack).toHaveBeenCalledWith('abc123');
    expect(inner.getPlaybackSource).toHaveBeenCalledWith('abc123');
  });

  it('exposes the wrapped provider identity, capabilities and price list', () => {
    expect(provider.id).toBe(MusicProviderId.YOUTUBE);
    expect(provider.capabilities.requiresVisiblePlayer).toBe(true);
    expect(provider.quota.searchUnits).toBe(101);
  });

  describe('cachedSearch', () => {
    it('answers a warm query without touching the provider', async () => {
      await provider.search('Tarkan Dudu', { limit: 10 });
      vi.mocked(inner.search).mockClear();

      const outcome = await provider.cachedSearch('tarkan dudu', { limit: 10 });

      expect(outcome?.results).toEqual([result]);
      expect(outcome?.cached).toBe(true);
      expect(inner.search).not.toHaveBeenCalled();
    });

    it('says nothing rather than guessing when only the provider can answer', async () => {
      // The caller uses this to decide whether the search is about to cost quota, so a cold query
      // must be reported as unanswerable instead of as an empty result set.
      expect(await provider.cachedSearch('hic aranmamis', { limit: 10 })).toBeNull();
      expect(inner.search).not.toHaveBeenCalled();
    });
  });
});
