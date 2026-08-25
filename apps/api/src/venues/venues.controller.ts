import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  JoinVenueResponse,
  NearbyVenueDto,
  NowPlayingDto,
  QueueEntryDto,
  TopRequestDto,
  VenueDetailDto,
} from '@moodisto/shared-types';
import {
  nearbyVenuesQuerySchema,
  qrTokenSchema,
  topRequestsQuerySchema,
  venueSlugSchema,
  type NearbyVenuesQuery,
  type TopRequestsQuery,
} from '@moodisto/validation';
import { DATABASE, type Database } from '../application/ports';
import { toQueueEntryDto } from '../application/dto-mappers';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentCustomer } from '../auth/current-user.decorator';
import type { CustomerIdentity } from '../auth/authenticated-request';
import { Inject } from '@nestjs/common';
import { JoinVenueUseCase } from './join-venue.usecase';
import { VenueLookupService } from './venue-lookup.service';
import { VenueQueriesService } from './venue-queries.service';

@Controller()
@UseGuards(RateLimitGuard)
export class VenuesController {
  constructor(
    private readonly join: JoinVenueUseCase,
    private readonly lookup: VenueLookupService,
    private readonly queries: VenueQueriesService,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  /** QR tokens are brute-force throttled: they are the only thing standing in front of a venue. */
  @Post('join/:qrToken')
  @RateLimit({
    bucket: 'qr-join',
    by: 'ip',
    limit: 20,
    windowSeconds: 300,
    message: 'Çok fazla QR denemesi yapıldı, lütfen biraz bekleyin.',
  })
  joinByQr(
    @Param('qrToken', zodBody(qrTokenSchema)) qrToken: string,
    @CurrentCustomer() customer: CustomerIdentity,
  ): Promise<JoinVenueResponse> {
    return this.join.execute(qrToken, customer);
  }

  @Get('venues/nearby')
  nearby(
    @Query(zodBody(nearbyVenuesQuerySchema)) query: NearbyVenuesQuery,
  ): Promise<readonly NearbyVenueDto[]> {
    return this.queries.nearby(query);
  }

  @Get('venues/:slug')
  detail(@Param('slug', zodBody(venueSlugSchema)) slug: string): Promise<VenueDetailDto> {
    return this.lookup.detailBySlug(slug);
  }

  @Get('venues/:slug/now-playing')
  nowPlaying(@Param('slug', zodBody(venueSlugSchema)) slug: string): Promise<NowPlayingDto> {
    return this.queries.nowPlaying(slug);
  }

  @Get('venues/:slug/queue')
  async publicQueue(
    @Param('slug', zodBody(venueSlugSchema)) slug: string,
  ): Promise<readonly QueueEntryDto[]> {
    const venue = await this.lookup.requireBySlug(slug);
    const active = await this.database.read().queue.listActive(venue.id);
    return active.map(toQueueEntryDto);
  }

  @Get('venues/:slug/top')
  topRequests(
    @Param('slug', zodBody(venueSlugSchema)) slug: string,
    @Query(zodBody(topRequestsQuerySchema)) query: TopRequestsQuery,
  ): Promise<readonly TopRequestDto[]> {
    return this.queries.topRequests(slug, query);
  }
}
