import { Prisma } from '@moodisto/database';
import { QueueItemState } from '@moodisto/shared-types';
import type {
  QueueEntryRecord,
  QueuePositionAssignment,
  QueueRepository,
} from '../../application/ports';
import { queueItemInclude, toQueueEntryRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

const ACTIVE_STATES = [QueueItemState.PLAYING, QueueItemState.QUEUED] as const;

export class PrismaQueueRepository implements QueueRepository {
  constructor(private readonly tx: PrismaTx) {}

  async listActive(venueId: string): Promise<readonly QueueEntryRecord[]> {
    const rows = await this.tx.queueItem.findMany({
      where: { venueId, state: { in: [...ACTIVE_STATES] } },
      include: queueItemInclude,
      orderBy: { position: 'asc' },
    });
    return rows.map(toQueueEntryRecord);
  }

  async findCurrent(venueId: string): Promise<QueueEntryRecord | null> {
    const row = await this.tx.queueItem.findFirst({
      where: { venueId, state: QueueItemState.PLAYING },
      include: queueItemInclude,
    });
    return row ? toQueueEntryRecord(row) : null;
  }

  async findById(queueItemId: string): Promise<QueueEntryRecord | null> {
    const row = await this.tx.queueItem.findUnique({
      where: { id: queueItemId },
      include: queueItemInclude,
    });
    return row ? toQueueEntryRecord(row) : null;
  }

  /**
   * Positions are unique among active rows, so a single `position = position + 1` would trip the
   * index halfway through. Negating first moves the whole set out of the way atomically.
   */
  async shiftPositionsBy(ids: readonly string[], delta: number): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const idList = Prisma.join(ids.map((id) => Prisma.sql`${id}`));
    await this.tx.$executeRaw`
      UPDATE queue_items SET position = -position WHERE id IN (${idList})
    `;
    await this.tx.$executeRaw`
      UPDATE queue_items SET position = -position + ${delta} WHERE id IN (${idList})
    `;
  }

  async applyPositions(assignments: readonly QueuePositionAssignment[]): Promise<void> {
    if (assignments.length === 0) {
      return;
    }
    const idList = Prisma.join(assignments.map((assignment) => Prisma.sql`${assignment.id}`));
    await this.tx.$executeRaw`
      UPDATE queue_items SET position = -position WHERE id IN (${idList})
    `;
    const cases = Prisma.join(
      assignments.map(
        (assignment) => Prisma.sql`WHEN ${assignment.id} THEN ${assignment.position}::int`,
      ),
      ' ',
    );
    await this.tx.$executeRaw`
      UPDATE queue_items
      SET position = CASE id ${cases} ELSE position END
      WHERE id IN (${idList})
    `;
  }

  async insert(input: {
    venueId: string;
    songRequestId: string;
    position: number;
  }): Promise<QueueEntryRecord> {
    const row = await this.tx.queueItem.create({
      data: { ...input, state: QueueItemState.QUEUED },
      include: queueItemInclude,
    });
    return toQueueEntryRecord(row);
  }

  async updateState(
    queueItemId: string,
    state: QueueItemState,
    timestamps?: { startedAt?: Date; endedAt?: Date },
  ): Promise<QueueEntryRecord> {
    const row = await this.tx.queueItem.update({
      where: { id: queueItemId },
      data: {
        state,
        ...(timestamps?.startedAt ? { startedAt: timestamps.startedAt } : {}),
        ...(timestamps?.endedAt ? { completedAt: timestamps.endedAt } : {}),
      },
      include: queueItemInclude,
    });
    return toQueueEntryRecord(row);
  }

  /**
   * `SKIP LOCKED` means a second player tab racing for the same venue advances to a different
   * row instead of blocking; combined with the venue lock only one of them ever wins.
   */
  async claimNextQueued(venueId: string): Promise<QueueEntryRecord | null> {
    const rows = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM queue_items
      WHERE "venueId" = ${venueId} AND state = 'QUEUED'::"QueueItemState"
      ORDER BY position ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const next = rows[0];
    return next ? this.findById(next.id) : null;
  }

  async countQueued(venueId: string): Promise<number> {
    return this.tx.queueItem.count({ where: { venueId, state: QueueItemState.QUEUED } });
  }
}
