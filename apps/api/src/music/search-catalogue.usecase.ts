import { Inject, Injectable } from '@nestjs/common';
import type { MusicProvider } from '@moodisto/music-provider';
import { tokenizeCatalogueQuery } from '@moodisto/queue-engine';
import { MusicSearchSource, type MusicSearchResponse } from '@moodisto/shared-types';
import type { MusicSearchQuery } from '@moodisto/validation';
import { DATABASE, type Database, type TrackRecord } from '../application/ports';
import { MUSIC_PROVIDER } from './music-provider.factory';
import { ProviderQuotaService } from './provider-quota.service';
import { toTrackSearchResultDto } from './track-search-result.mapper';
import { filterTracksBlockedByVenue } from './venue-track-visibility';

/**
 * Searches the tracks Moodisto already stores, spending no provider quota at all.
 *
 * This is what every keystroke goes through. Provider search is the exception, reached only when
 * the guest says the catalogue did not have what they wanted — see `SearchProviderUseCase`.
 */
@Injectable()
export class SearchCatalogueUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(MUSIC_PROVIDER) private readonly provider: MusicProvider,
    private readonly quota: ProviderQuotaService,
  ) {}

  async execute(query: MusicSearchQuery): Promise<MusicSearchResponse> {
    const tokens = tokenizeCatalogueQuery(query.q);
    const uow = this.database.read();
    const found: readonly TrackRecord[] = await uow.tracks.searchCatalogue({
      tokens,
      limit: query.limit,
    });
    const visible = query.venueId
      ? await filterTracksBlockedByVenue(uow, query.venueId, found)
      : found;

    return {
      provider: this.provider.id,
      query: tokens.join(' '),
      source: MusicSearchSource.CATALOGUE,
      cached: false,
      // Sent with every answer so the screen can offer the paid search — or explain why it cannot
      // — without a second round trip.
      providerSearch: await this.quota.availability(),
      results: visible.map(toTrackSearchResultDto),
    };
  }
}
