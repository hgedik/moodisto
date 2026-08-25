import type { MusicProviderId } from '@moodisto/shared-types';
import { normalizeSearchQuery } from '@moodisto/queue-engine';
import type {
  MusicProvider,
  MusicProviderCapabilities,
  MusicSearchCache,
  MusicSearchOptions,
  PlaybackSource,
  ProviderTrack,
  TrackSearchResult,
} from '../ports';

export interface CachedSearchOutcome {
  readonly results: TrackSearchResult[];
  readonly cached: boolean;
  readonly normalizedQuery: string;
}

export interface CachedMusicProviderOptions {
  readonly ttlSeconds: number;
}

/**
 * Decorates any {@link MusicProvider} with a persistent search cache.
 *
 * Search is the only call that costs external quota, so it is the only call this decorator
 * touches; everything else is delegated untouched. Empty result sets are deliberately not cached
 * so that a transient upstream hiccup does not pin a query to "no results" for a whole day.
 */
export class CachedMusicProvider implements MusicProvider {
  public constructor(
    private readonly inner: MusicProvider,
    private readonly cache: MusicSearchCache,
    private readonly options: CachedMusicProviderOptions,
  ) {}

  public get id(): MusicProviderId {
    return this.inner.id;
  }

  public get capabilities(): MusicProviderCapabilities {
    return this.inner.capabilities;
  }

  public async search(query: string, options: MusicSearchOptions): Promise<TrackSearchResult[]> {
    return (await this.searchWithCacheInfo(query, options)).results;
  }

  public async searchWithCacheInfo(
    query: string,
    options: MusicSearchOptions,
  ): Promise<CachedSearchOutcome> {
    const normalizedQuery = normalizeSearchQuery(query);

    const cached = await this.cache.read(this.inner.id, normalizedQuery);
    if (cached !== null && cached.length > 0) {
      return { results: cached.slice(0, options.limit), cached: true, normalizedQuery };
    }

    const results = await this.inner.search(normalizedQuery, options);
    if (results.length > 0) {
      await this.cache.write(this.inner.id, normalizedQuery, results, this.options.ttlSeconds);
    }
    return { results, cached: false, normalizedQuery };
  }

  public getTrack(providerTrackId: string): Promise<ProviderTrack | null> {
    return this.inner.getTrack(providerTrackId);
  }

  public getPlaybackSource(providerTrackId: string): Promise<PlaybackSource> {
    return this.inner.getPlaybackSource(providerTrackId);
  }
}
