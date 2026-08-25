import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { MusicSearchResponse } from '@moodisto/shared-types';
import { musicSearchQuerySchema, type MusicSearchQuery } from '@moodisto/validation';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { SearchMusicUseCase } from './search-music.usecase';

@Controller('music')
@UseGuards(RateLimitGuard)
export class MusicController {
  constructor(private readonly search: SearchMusicUseCase) {}

  /**
   * The provider API key stays on the server: the browser never sees it and never calls the
   * provider directly.
   */
  @Get('search')
  @RateLimit({
    bucket: 'music-search',
    by: 'ip',
    limit: 30,
    windowSeconds: 60,
    message: 'Çok fazla arama yaptınız, lütfen biraz bekleyin.',
  })
  searchTracks(
    @Query(zodBody(musicSearchQuerySchema)) query: MusicSearchQuery,
  ): Promise<MusicSearchResponse> {
    return this.search.execute(query);
  }
}
