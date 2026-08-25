import { Inject, Injectable } from '@nestjs/common';
import { CachedMusicProvider, type MusicProvider } from '@moodisto/music-provider';
import { MusicSearchSource, type MusicSearchResponse } from '@moodisto/shared-types';
import type { MusicSearchQuery } from '@moodisto/validation';
import { DATABASE, type Database, type TrackUpsertInput } from '../application/ports';
import { MUSIC_PROVIDER } from './music-provider.factory';
import { toTrackSearchResultDto } from './track-search-result.mapper';
import { filterTracksBlockedByVenue } from './venue-track-visibility';

/**
 * Searches the external provider, which is the only thing in Moodisto that costs quota.
 *
 * Reached only when a guest explicitly asks for it, because the local catalogue could not answer.
 * Whatever comes back is persisted, so this query — and every rewording of it — is answered from
 * the catalogue from now on.
 */
@Injectable()
export class SearchProviderUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(MUSIC_PROVIDER) private readonly provider: MusicProvider,
  ) {}

  async execute(query: MusicSearchQuery): Promise<MusicSearchResponse> {
    const outcome =
      this.provider instanceof CachedMusicProvider
        ? await this.provider.searchWithCacheInfo(query.q, { limit: query.limit })
        : {
            results: await this.provider.search(query.q, { limit: query.limit }),
            cached: false,
            normalizedQuery: query.q,
          };

    const uow = this.database.read();
    const visible = query.venueId
      ? await filterTracksBlockedByVenue(uow, query.venueId, outcome.results)
      : outcome.results;

    // Persisting the blocked ones too would leak them into the shared catalogue for other venues
    // to find, so only what this guest may see is kept.
    if (visible.length > 0) {
      await uow.tracks.upsertMany(visible as readonly TrackUpsertInput[]);
    }

    return {
      provider: this.provider.id,
      query: outcome.normalizedQuery,
      source: MusicSearchSource.PROVIDER,
      cached: outcome.cached,
      results: visible.map(toTrackSearchResultDto),
    };
  }
}
