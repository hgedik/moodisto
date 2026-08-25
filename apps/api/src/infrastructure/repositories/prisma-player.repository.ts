import { PlaybackState } from '@moodisto/shared-types';
import type {
  PlayerLeaseRecord,
  PlayerRepository,
  PlayerStateRecord,
} from '../../application/ports';
import { toPlayerLeaseRecord, toPlayerStateRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaPlayerRepository implements PlayerRepository {
  constructor(private readonly tx: PrismaTx) {}

  async getState(venueId: string): Promise<PlayerStateRecord | null> {
    const row = await this.tx.playerState.findUnique({ where: { venueId } });
    return row ? toPlayerStateRecord(row) : null;
  }

  /**
   * `version` increases on every transition so a reconnecting player tab can tell whether the
   * state it renders is still the current one.
   */
  async saveState(input: {
    venueId: string;
    state: PlaybackState;
    queueItemId: string | null;
    startedAt: Date | null;
  }): Promise<PlayerStateRecord> {
    const trackId = input.queueItemId
      ? ((
          await this.tx.queueItem.findUnique({
            where: { id: input.queueItemId },
            select: { songRequest: { select: { trackId: true } } },
          })
        )?.songRequest.trackId ?? null)
      : null;

    const shared = {
      state: input.state,
      queueItemId: input.queueItemId,
      trackId,
      startedAt: input.startedAt,
      pausedAt: input.state === PlaybackState.PAUSED ? new Date() : null,
    };

    const row = await this.tx.playerState.upsert({
      where: { venueId: input.venueId },
      update: { ...shared, version: { increment: 1 } },
      create: { venueId: input.venueId, ...shared, version: 1 },
    });
    return toPlayerStateRecord(row);
  }

  async getLease(venueId: string): Promise<PlayerLeaseRecord | null> {
    const row = await this.tx.playerLease.findUnique({ where: { venueId } });
    return row ? toPlayerLeaseRecord(row) : null;
  }

  async acquireLease(venueId: string, sessionId: string, now: Date): Promise<PlayerLeaseRecord> {
    const row = await this.tx.playerLease.upsert({
      where: { venueId },
      update: { sessionId, lastHeartbeatAt: now },
      create: { venueId, sessionId, lastHeartbeatAt: now },
    });
    return toPlayerLeaseRecord(row);
  }

  /** Returns null when another tab has taken the lease, which is how a takeover is detected. */
  async heartbeat(
    venueId: string,
    sessionId: string,
    now: Date,
  ): Promise<PlayerLeaseRecord | null> {
    const result = await this.tx.playerLease.updateMany({
      where: { venueId, sessionId },
      data: { lastHeartbeatAt: now },
    });
    if (result.count === 0) {
      return null;
    }
    return this.getLease(venueId);
  }

  async releaseLease(venueId: string, sessionId: string): Promise<void> {
    await this.tx.playerLease.deleteMany({ where: { venueId, sessionId } });
  }
}
