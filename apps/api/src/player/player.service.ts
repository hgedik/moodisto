import { Inject, Injectable } from '@nestjs/common';
import { PLAYER_LEASE_STALE_AFTER_SECONDS } from '@moodisto/validation';
import { shouldHaltPlayback } from '@moodisto/queue-engine';
import {
  PlaybackState,
  PlayerCommand,
  type PlayerLeaseDto,
  type PlayerStateDto,
} from '@moodisto/shared-types';
import {
  CLOCK,
  DATABASE,
  type Clock,
  type Database,
  type PlayerLeaseRecord,
  type UnitOfWork,
} from '../application/ports';
import { toPlayerStateDto } from '../application/dto-mappers';
import { publishPlayerCommand } from '../application/services/realtime-messages';
import { ConflictError } from '../common/errors';
import { QueueService } from '../queue/queue.service';

const isLeaseFresh = (lease: PlayerLeaseRecord, now: Date): boolean =>
  now.getTime() - lease.lastHeartbeatAt.getTime() < PLAYER_LEASE_STALE_AFTER_SECONDS * 1000;

/**
 * Drives playback from the server's point of view.
 *
 * The browser tab is a renderer that reports what happened; it never decides what plays next.
 * Exactly one tab holds the venue lease, so two open player windows cannot double-advance the
 * queue.
 */
@Injectable()
export class PlayerService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queue: QueueService,
  ) {}

  async getState(venueId: string, sessionId: string | null): Promise<PlayerStateDto> {
    const uow = this.database.read();
    return this.buildState(uow, venueId, sessionId);
  }

  /**
   * Claims the lease and, when nothing is playing yet, pulls the first queued item so that the
   * venue only has to press "start" once per evening.
   */
  async start(
    venueId: string,
    input: { sessionId: string; takeover: boolean },
  ): Promise<PlayerStateDto> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      await uow.venues.lockForUpdate(venueId);

      const existing = await uow.player.getLease(venueId);
      if (
        existing &&
        existing.sessionId !== input.sessionId &&
        isLeaseFresh(existing, now) &&
        !input.takeover
      ) {
        throw new ConflictError(
          'Bu mekân için başka bir sekmede player zaten çalışıyor.',
          'PLAYER_ALREADY_RUNNING',
        );
      }

      if (existing && existing.sessionId !== input.sessionId) {
        publishPlayerCommand(uow, venueId, PlayerCommand.LeaseRevoked, now);
      }
      await uow.player.acquireLease(venueId, input.sessionId, now);

      const current = await uow.queue.findCurrent(venueId);
      if (!current) {
        await this.queue.advance(uow, venueId, now);
      } else {
        const state = await uow.player.getState(venueId);
        if (!state || state.state !== PlaybackState.PLAYING) {
          await uow.player.saveState({
            venueId,
            state: PlaybackState.PLAYING,
            queueItemId: current.id,
            startedAt: current.startedAt ?? now,
          });
        }
      }

      await this.queue.broadcastVenueState(uow, venueId);
      return this.buildState(uow, venueId, input.sessionId);
    });
  }

  /** The tab reports that a specific item finished; advancing is the server's decision. */
  async complete(
    venueId: string,
    input: { sessionId: string; queueItemId: string },
  ): Promise<PlayerStateDto> {
    return this.transition(venueId, input.sessionId, async (uow, now) => {
      const current = await uow.queue.findCurrent(venueId);
      // A stale tab may report an item that is no longer current; ignoring it prevents a
      // late "ended" event from skipping the song that is actually playing.
      if (!current || current.id !== input.queueItemId) {
        return;
      }
      await this.queue.finishCurrent(uow, venueId, now, 'COMPLETED');
      await this.queue.advance(uow, venueId, now);
    });
  }

  /**
   * Playback error (unavailable video, embedding disabled): fail the item and move on.
   *
   * Moving on is only safe while the failures are isolated. Once enough tracks have failed in a
   * row without a single one reaching the speakers, the problem is the venue's setup rather than
   * the song, and skipping further would silently throw away every request the guests made — so
   * the player stops and waits for someone to look at it.
   */
  async reportError(
    venueId: string,
    input: { sessionId: string; queueItemId: string },
  ): Promise<PlayerStateDto> {
    return this.transition(venueId, input.sessionId, async (uow, now) => {
      const current = await uow.queue.findCurrent(venueId);
      if (!current || current.id !== input.queueItemId) {
        return;
      }
      await this.queue.finishCurrent(uow, venueId, now, 'FAILED');

      const consecutiveFailures = await uow.queue.countFailuresSinceLastPlayback(venueId);
      if (shouldHaltPlayback(consecutiveFailures)) {
        await this.queue.halt(uow, venueId);
        return;
      }
      await this.queue.advance(uow, venueId, now);
    });
  }

  /** Manual skip. The track did reach the speakers, so it still counts as completed. */
  async skip(venueId: string, sessionId: string | null): Promise<PlayerStateDto> {
    return this.transition(venueId, sessionId, async (uow, now) => {
      await this.queue.finishCurrent(uow, venueId, now, 'COMPLETED');
      await this.queue.advance(uow, venueId, now);
      publishPlayerCommand(uow, venueId, PlayerCommand.Play, now);
    });
  }

  async pause(venueId: string, sessionId: string | null): Promise<PlayerStateDto> {
    return this.transition(venueId, sessionId, async (uow, now) => {
      const current = await uow.queue.findCurrent(venueId);
      if (!current) {
        return;
      }
      await uow.player.saveState({
        venueId,
        state: PlaybackState.PAUSED,
        queueItemId: current.id,
        startedAt: current.startedAt,
      });
      publishPlayerCommand(uow, venueId, PlayerCommand.Pause, now);
    });
  }

  async resume(venueId: string, sessionId: string | null): Promise<PlayerStateDto> {
    return this.transition(venueId, sessionId, async (uow, now) => {
      const current = await uow.queue.findCurrent(venueId);
      if (!current) {
        await this.queue.advance(uow, venueId, now);
        publishPlayerCommand(uow, venueId, PlayerCommand.Play, now);
        return;
      }
      await uow.player.saveState({
        venueId,
        state: PlaybackState.PLAYING,
        queueItemId: current.id,
        startedAt: current.startedAt ?? now,
      });
      publishPlayerCommand(uow, venueId, PlayerCommand.Resume, now);
    });
  }

  async heartbeat(venueId: string, sessionId: string): Promise<PlayerLeaseDto> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      const renewed = await uow.player.heartbeat(venueId, sessionId, now);
      if (renewed) {
        return this.toLeaseDto(renewed, sessionId);
      }

      // Another tab owns the lease. Reporting that truthfully lets this tab stop rendering
      // instead of two players fighting over the same speakers.
      const owner = await uow.player.getLease(venueId);
      if (owner && isLeaseFresh(owner, now)) {
        return this.toLeaseDto(owner, sessionId);
      }

      const reclaimed = await uow.player.acquireLease(venueId, sessionId, now);
      return this.toLeaseDto(reclaimed, sessionId);
    });
  }

  async release(venueId: string, sessionId: string): Promise<void> {
    await this.database.transaction(async (uow) => {
      await uow.player.releaseLease(venueId, sessionId);
    });
  }

  private async transition(
    venueId: string,
    sessionId: string | null,
    work: (uow: UnitOfWork, now: Date) => Promise<void>,
  ): Promise<PlayerStateDto> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      await uow.venues.lockForUpdate(venueId);
      await work(uow, now);
      await this.queue.broadcastVenueState(uow, venueId);
      return this.buildState(uow, venueId, sessionId);
    });
  }

  private async buildState(
    uow: UnitOfWork,
    venueId: string,
    sessionId: string | null,
  ): Promise<PlayerStateDto> {
    const now = this.clock.now();
    const [snapshot, state, lease] = await Promise.all([
      this.queue.snapshot(uow, venueId),
      uow.player.getState(venueId),
      uow.player.getLease(venueId),
    ]);

    const leaseOwned =
      sessionId !== null &&
      lease !== null &&
      lease.sessionId === sessionId &&
      isLeaseFresh(lease, now);

    return toPlayerStateDto({
      state: state ?? {
        venueId,
        state: PlaybackState.IDLE,
        queueItemId: null,
        version: 0,
        startedAt: null,
        updatedAt: now,
      },
      current: snapshot.current,
      upcoming: snapshot.upcoming,
      leaseOwned,
    });
  }

  private toLeaseDto(lease: PlayerLeaseRecord, callerSessionId: string): PlayerLeaseDto {
    return {
      venueId: lease.venueId,
      sessionId: lease.sessionId,
      heldByCaller: lease.sessionId === callerSessionId,
      lastHeartbeatAt: lease.lastHeartbeatAt.toISOString(),
      staleAfterSeconds: PLAYER_LEASE_STALE_AFTER_SECONDS,
    };
  }
}
