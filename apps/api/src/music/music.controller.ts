import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { MusicSearchResponse } from '@moodisto/shared-types';
import { musicSearchQuerySchema, type MusicSearchQuery } from '@moodisto/validation';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { SearchCatalogueUseCase } from './search-catalogue.usecase';
import { SearchProviderUseCase } from './search-provider.usecase';

@Controller('music')
@UseGuards(RateLimitGuard)
export class MusicController {
  constructor(
    private readonly catalogue: SearchCatalogueUseCase,
    private readonly providerSearch: SearchProviderUseCase,
  ) {}

  /**
   * What every keystroke goes through: the tracks Moodisto already knows about.
   *
   * Costs no provider quota, so the limit here only exists to keep one browser from hammering the
   * database.
   */
  @Get('search')
  @RateLimit({
    bucket: 'music-search',
    by: 'ip',
    limit: 90,
    windowSeconds: 60,
    message: 'Çok fazla arama yaptınız, lütfen biraz bekleyin.',
  })
  searchCatalogue(
    @Query(zodBody(musicSearchQuerySchema)) query: MusicSearchQuery,
  ): Promise<MusicSearchResponse> {
    return this.catalogue.execute(query);
  }

  /**
   * The external provider, reached only when a guest asks for it by name.
   *
   * The provider API key stays on the server: the browser never sees it and never calls the
   * provider directly. This is the expensive door, so it keeps the tighter limit.
   */
  @Get('provider-search')
  @RateLimit({
    bucket: 'music-provider-search',
    by: 'ip',
    limit: 30,
    windowSeconds: 60,
    message: 'Çok fazla arama yaptınız, lütfen biraz bekleyin.',
  })
  searchProvider(
    @Query(zodBody(musicSearchQuerySchema)) query: MusicSearchQuery,
  ): Promise<MusicSearchResponse> {
    return this.providerSearch.execute(query);
  }
}
