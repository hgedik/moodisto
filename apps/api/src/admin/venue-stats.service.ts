import { Inject, Injectable } from '@nestjs/common';
import { RequestStatus, StatsPeriod, type VenueStatsDto } from '@moodisto/shared-types';
import type { StatsQuery } from '@moodisto/validation';
import { CLOCK, DATABASE, type Clock, type Database } from '../application/ports';
import { toTopRequestDto } from '../application/dto-mappers';
import { NotFoundError } from '../common/errors';
import { VenueLookupService } from '../venues/venue-lookup.service';

const TOP_TRACK_LIMIT = 10;

/** Statuses that mean the venue actually took the request on board. */
const FULFILLED_STATUSES: readonly RequestStatus[] = [
  RequestStatus.ACCEPTED,
  RequestStatus.QUEUED,
  RequestStatus.PLAYING,
  RequestStatus.COMPLETED,
];

const startOfDay = (now: Date): Date => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
};

const daysAgo = (now: Date, days: number): Date => {
  const start = startOfDay(now);
  start.setDate(start.getDate() - days);
  return start;
};

export const resolveStatsRange = (query: StatsQuery, now: Date): { from: Date; to: Date } => {
  switch (query.period) {
    case StatsPeriod.TODAY:
      return { from: startOfDay(now), to: now };
    case StatsPeriod.LAST_7_DAYS:
      return { from: daysAgo(now, 7), to: now };
    case StatsPeriod.LAST_30_DAYS:
      return { from: daysAgo(now, 30), to: now };
    case StatsPeriod.CUSTOM:
      // The schema guarantees both bounds are present for a custom period.
      return { from: query.from as Date, to: query.to as Date };
  }
};

@Injectable()
export class VenueStatsService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly lookup: VenueLookupService,
  ) {}

  async execute(venueId: string, query: StatsQuery): Promise<VenueStatsDto> {
    const venue = await this.lookup.requireById(venueId);
    const range = resolveStatsRange(query, this.clock.now());
    const uow = this.database.read();

    const pricing = await uow.venues.getPricing(venueId);
    if (!pricing) {
      throw new NotFoundError('Mekân fiyatlandırması tanımlı değil.', 'VENUE_PRICING_MISSING');
    }

    const [aggregate, topTracks, queueLength] = await Promise.all([
      uow.stats.aggregate(venueId, range.from, range.to, venue.timezone),
      uow.stats.topRequests({
        venueId,
        from: range.from,
        to: range.to,
        limit: TOP_TRACK_LIMIT,
        statuses: FULFILLED_STATUSES,
      }),
      uow.queue.countQueued(venueId),
    ]);

    const busiest = aggregate.requestsByHour.reduce<{ hour: number; count: number } | null>(
      (best, entry) => (best === null || entry.count > best.count ? entry : best),
      null,
    );

    return {
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      totalRequests: aggregate.totalRequests,
      acceptedRequests: aggregate.acceptedRequests,
      rejectedRequests: aggregate.rejectedRequests,
      paidRequests: aggregate.paidRequests,
      totalRevenueMinor: aggregate.totalRevenueMinor,
      currency: pricing.currency,
      queueLength,
      averageWaitSeconds: aggregate.averageWaitSeconds,
      topTracks: topTracks.map(toTopRequestDto),
      busiestHour: busiest?.hour ?? null,
      requestsByHour: aggregate.requestsByHour,
    };
  }
}
