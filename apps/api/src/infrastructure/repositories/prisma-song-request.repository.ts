import { type Prisma } from '@moodisto/database';
import { RequestStatus } from '@moodisto/shared-types';
import type {
  AdminRequestFilter,
  CreateSongRequestInput,
  SongRequestRecord,
  SongRequestRepository,
  SongRequestStatusChange,
} from '../../application/ports';
import { songRequestInclude, toSongRequestRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

/**
 * A request only reaches the venue once it is paid for. One still at checkout, or one whose
 * checkout failed before it was ever approved, is invisible to the console — `acceptedAt` is what
 * separates a failed payment from a track that failed on the speakers.
 */
const UNANNOUNCED_EXCLUSION: readonly Prisma.SongRequestWhereInput[] = [
  { status: { not: RequestStatus.PENDING_PAYMENT } },
  { NOT: { status: RequestStatus.FAILED, acceptedAt: null } },
];

/** Statuses that still hold a slot in the venue, so a duplicate must not be accepted twice. */
const OCCUPYING_STATUSES = [
  RequestStatus.PENDING,
  RequestStatus.ACCEPTED,
  RequestStatus.QUEUED,
  RequestStatus.PLAYING,
] as const;

export class PrismaSongRequestRepository implements SongRequestRepository {
  constructor(private readonly tx: PrismaTx) {}

  async create(input: CreateSongRequestInput): Promise<SongRequestRecord> {
    const row = await this.tx.songRequest.create({
      data: {
        venueId: input.venueId,
        customerSessionId: input.customerSessionId,
        trackId: input.trackId,
        requestType: input.requestType,
        status: input.status,
        tableLabel: input.tableLabel,
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      include: songRequestInclude,
    });
    return toSongRequestRecord(row);
  }

  async findById(requestId: string): Promise<SongRequestRecord | null> {
    const row = await this.tx.songRequest.findUnique({
      where: { id: requestId },
      include: songRequestInclude,
    });
    return row ? toSongRequestRecord(row) : null;
  }

  async applyStatusChange(
    requestId: string,
    change: SongRequestStatusChange,
  ): Promise<SongRequestRecord> {
    const row = await this.tx.songRequest.update({
      where: { id: requestId },
      data: {
        status: change.status,
        ...(change.rejectionReason === undefined
          ? {}
          : { rejectionReason: change.rejectionReason }),
        ...(change.acceptedAt ? { acceptedAt: change.acceptedAt } : {}),
        ...(change.rejectedAt ? { rejectedAt: change.rejectedAt } : {}),
        ...(change.queuedAt ? { queuedAt: change.queuedAt } : {}),
        ...(change.playingAt ? { playingAt: change.playingAt } : {}),
        ...(change.completedAt ? { completedAt: change.completedAt } : {}),
      },
      include: songRequestInclude,
    });
    return toSongRequestRecord(row);
  }

  async list(
    filter: AdminRequestFilter,
  ): Promise<{ items: readonly SongRequestRecord[]; total: number }> {
    const where: Prisma.SongRequestWhereInput = {
      venueId: filter.venueId,
      ...(filter.statuses && filter.statuses.length > 0
        ? { status: { in: [...filter.statuses] } }
        : {}),
      ...(filter.requestType ? { requestType: filter.requestType } : {}),
      ...(filter.excludeUnannounced ? { AND: [...UNANNOUNCED_EXCLUSION] } : {}),
    };

    const [items, total] = await Promise.all([
      this.tx.songRequest.findMany({
        where,
        include: songRequestInclude,
        orderBy: { createdAt: 'desc' },
        take: filter.take,
        skip: filter.skip,
      }),
      this.tx.songRequest.count({ where }),
    ]);

    return { items: items.map(toSongRequestRecord), total };
  }

  async listForCustomerSession(
    sessionId: string,
    venueId: string,
    take: number,
  ): Promise<readonly SongRequestRecord[]> {
    const rows = await this.tx.songRequest.findMany({
      where: { customerSessionId: sessionId, venueId },
      include: songRequestInclude,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map(toSongRequestRecord);
  }

  async findActiveTrackIds(venueId: string): Promise<readonly string[]> {
    const rows = await this.tx.songRequest.findMany({
      where: { venueId, status: { in: [...OCCUPYING_STATUSES] } },
      select: { trackId: true },
      distinct: ['trackId'],
    });
    return rows.map((row) => row.trackId);
  }

  async findLastCompletedAt(venueId: string, trackId: string): Promise<Date | null> {
    const row = await this.tx.songRequest.findFirst({
      where: { venueId, trackId, status: RequestStatus.COMPLETED, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });
    return row?.completedAt ?? null;
  }

  /** Unpaid requests must not sit in the admin inbox forever; they expire instead. */
  async expireStalePendingPayments(venueId: string, olderThan: Date): Promise<readonly string[]> {
    const stale = await this.tx.songRequest.findMany({
      where: {
        venueId,
        status: RequestStatus.PENDING_PAYMENT,
        createdAt: { lt: olderThan },
      },
      select: { id: true },
    });
    if (stale.length === 0) {
      return [];
    }
    const ids = stale.map((row) => row.id);
    await this.tx.songRequest.updateMany({
      where: { id: { in: ids } },
      data: { status: RequestStatus.EXPIRED },
    });
    return ids;
  }
}
