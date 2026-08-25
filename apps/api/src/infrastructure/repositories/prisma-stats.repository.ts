import { PaymentStatus, type RequestStatus } from '@moodisto/shared-types';
import type {
  StatsRepository,
  TopRequestRecord,
  VenueStatsAggregate,
} from '../../application/ports';
import { toTrackRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaStatsRepository implements StatsRepository {
  constructor(private readonly tx: PrismaTx) {}

  async aggregate(
    venueId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<VenueStatsAggregate> {
    const window = { venueId, createdAt: { gte: from, lte: to } };

    const [totalRequests, acceptedRequests, rejectedRequests, revenue, waits, hourly] =
      await Promise.all([
        this.tx.songRequest.count({ where: window }),
        // Approving and rejecting are decisions the venue made at a point in time, not statuses a
        // request still happens to be in. Counting by status would drop an approved song the
        // moment playback failed, and would credit today's counter to the day the request
        // arrived rather than the day the venue answered it.
        this.tx.songRequest.count({ where: { venueId, acceptedAt: { gte: from, lte: to } } }),
        this.tx.songRequest.count({ where: { venueId, rejectedAt: { gte: from, lte: to } } }),
        this.tx.payment.aggregate({
          where: {
            status: PaymentStatus.PAID,
            songRequest: window,
          },
          _sum: { amountMinor: true },
          _count: { _all: true },
        }),
        this.tx.$queryRaw<{ avgSeconds: number | null }[]>`
          SELECT AVG(EXTRACT(EPOCH FROM ("playingAt" - "createdAt")))::float8 AS "avgSeconds"
          FROM song_requests
          WHERE "venueId" = ${venueId}
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
            AND "playingAt" IS NOT NULL
        `,
        this.tx.$queryRaw<{ hour: number; count: bigint }[]>`
          SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE ${timezone}))::int AS hour,
                 COUNT(*)::bigint AS count
          FROM song_requests
          WHERE "venueId" = ${venueId}
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
          GROUP BY 1
          ORDER BY 1
        `,
      ]);

    return {
      totalRequests,
      acceptedRequests,
      rejectedRequests,
      paidRequests: revenue._count._all,
      totalRevenueMinor: revenue._sum.amountMinor ?? 0,
      averageWaitSeconds:
        waits[0]?.avgSeconds === null || waits[0]?.avgSeconds === undefined
          ? null
          : Math.round(waits[0].avgSeconds),
      requestsByHour: hourly.map((row) => ({ hour: row.hour, count: Number(row.count) })),
    };
  }

  async topRequests(input: {
    venueId: string;
    from: Date;
    to: Date;
    limit: number;
    statuses?: readonly RequestStatus[];
  }): Promise<readonly TopRequestRecord[]> {
    const grouped = await this.tx.songRequest.groupBy({
      by: ['trackId'],
      where: {
        venueId: input.venueId,
        createdAt: { gte: input.from, lte: input.to },
        ...(input.statuses && input.statuses.length > 0
          ? { status: { in: [...input.statuses] } }
          : {}),
      },
      _count: { _all: true },
      orderBy: { _count: { trackId: 'desc' } },
      take: input.limit,
    });

    if (grouped.length === 0) {
      return [];
    }

    const tracks = await this.tx.track.findMany({
      where: { id: { in: grouped.map((row) => row.trackId) } },
    });
    const byId = new Map(tracks.map((track) => [track.id, track]));

    return grouped.flatMap((row) => {
      const track = byId.get(row.trackId);
      return track ? [{ track: toTrackRecord(track), requestCount: row._count._all }] : [];
    });
  }
}
