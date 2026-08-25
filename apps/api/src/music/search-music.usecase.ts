import { Inject, Injectable } from '@nestjs/common';
import { CachedMusicProvider, type MusicProvider } from '@moodisto/music-provider';
import { findBlockingRule } from '@moodisto/queue-engine';
import type { MusicSearchResponse, TrackSearchResultDto } from '@moodisto/shared-types';
import type { MusicSearchQuery } from '@moodisto/validation';
import { DATABASE, type Database, type TrackUpsertInput } from '../application/ports';
import { MUSIC_PROVIDER } from './music-provider.factory';

@Injectable()
export class SearchMusicUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(MUSIC_PROVIDER) private readonly provider: MusicProvider,
  ) {}

  /**
   * Searching also persists what it finds. Creating a request afterwards therefore only needs
   * `(provider, providerTrackId)`: the browser never dictates track metadata, and no extra
   * provider quota is spent to look the track up again.
   */
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
      ? await this.filterBlocked(uow, query.venueId, outcome.results)
      : outcome.results;

    if (visible.length > 0) {
      await uow.tracks.upsertMany(visible as readonly TrackUpsertInput[]);
    }

    return {
      provider: this.provider.id,
      query: outcome.normalizedQuery,
      cached: outcome.cached,
      results: visible.map((result): TrackSearchResultDto => ({
        provider: result.provider,
        providerTrackId: result.providerTrackId,
        title: result.title,
        artist: result.artist,
        channelName: result.channelName,
        channelId: result.channelId,
        thumbnailUrl: result.thumbnailUrl,
        durationSeconds: result.durationSeconds,
      })),
    };
  }

  /** Blocked tracks are hidden at search time so the guest never gets a pointless rejection. */
  private async filterBlocked<T extends TrackUpsertInput>(
    uow: ReturnType<Database['read']>,
    venueId: string,
    results: readonly T[],
  ): Promise<readonly T[]> {
    const rules = await uow.blockedRules.listByVenue(venueId);
    if (rules.length === 0) {
      return results;
    }
    return results.filter((result) => findBlockingRule(rules, result) === null);
  }
}
