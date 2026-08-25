import { Inject, Injectable } from '@nestjs/common';
import { RequestStatus, TopRequestsPeriod } from '@moodisto/shared-types';
import type { NearbyVenueDto, NowPlayingDto, TopRequestDto } from '@moodisto/shared-types';
import {
  MAX_NEARBY_RESULTS,
  type NearbyVenuesQuery,
  type TopRequestsQuery,
} from '@moodisto/validation';
import { CLOCK, DATABASE, type Clock, type Database } from '../application/ports';
import { toNearbyVenueDto, toTopRequestDto } from '../application/dto-mappers';
import { QueueService } from '../queue/queue.service';
import { VenueLookupService } from './venue-lookup.service';

/** Start of the "tonight" window: an evening that runs past midnight is still the same night. */
const startOfTonight = (now: Date): Date => {
  const start = new Date(now);
  if (start.getHours() < 6) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(18, 0, 0, 0);
  return start;
};

const periodStart = (period: TopRequestsPeriod, now: Date): Date => {
  switch (period) {
    case TopRequestsPeriod.TONIGHT:
      return startOfTonight(now);
    case TopRequestsPeriod.TODAY: {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case TopRequestsPeriod.WEEK: {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return start;
    }
  }
};

@Injectable()
export class VenueQueriesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly lookup: VenueLookupService,
    private readonly queue: QueueService,
  ) {}

  async nearby(query: NearbyVenuesQuery): Promise<readonly NearbyVenueDto[]> {
    const venues = await this.database.read().venues.findNearby({
      latitude: query.lat,
      longitude: query.lng,
      radiusMeters: query.radiusMeters,
      limit: MAX_NEARBY_RESULTS,
    });
    return venues.map(toNearbyVenueDto);
  }

  async nowPlaying(slug: string): Promise<NowPlayingDto> {
    const venue = await this.lookup.requireBySlug(slug);
    return this.queue.buildNowPlaying(this.database.read(), venue.id);
  }

  async topRequests(slug: string, query: TopRequestsQuery): Promise<readonly TopRequestDto[]> {
    const venue = await this.lookup.requireBySlug(slug);
    const now = this.clock.now();
    const records = await this.database.read().stats.topRequests({
      venueId: venue.id,
      from: periodStart(query.period, now),
      to: now,
      limit: query.limit,
      statuses: [
        RequestStatus.ACCEPTED,
        RequestStatus.QUEUED,
        RequestStatus.PLAYING,
        RequestStatus.COMPLETED,
      ],
    });
    return records.map(toTopRequestDto);
  }
}
