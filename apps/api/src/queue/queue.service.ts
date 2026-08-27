import { Inject, Injectable } from '@nestjs/common';
import {
  assertRequestTransition,
  planCompaction,
  planReorder,
  resolveInsertionPosition,
  selectPositionsToShift,
  type ActiveQueueSlot,
} from '@moodisto/queue-engine';
import {
  PlaybackState,
  QueueItemState,
  RequestStatus,
  type NowPlayingDto,
  type RequestType,
} from '@moodisto/shared-types';
import type { QueueEntryRecord, UnitOfWork } from '../application/ports';
import { ConflictError, NotFoundError } from '../common/errors';
import {
  toPlayerStateDto,
  toQueueEntryDto,
  toSongRequestDto,
  toTrackDto,
} from '../application/dto-mappers';
import { SystemSettingsService } from '../settings/system-settings.service';
import type { FeatureFlagSource } from '../settings/feature-flag-source';
import {
  publishNowPlaying,
  publishPlayerUpdated,
  publishQueueUpdated,
  publishRequestUpdated,
} from '../application/services/realtime-messages';

export interface QueueSnapshot {
  readonly active: readonly QueueEntryRecord[];
  readonly current: QueueEntryRecord | null;
  readonly upcoming: readonly QueueEntryRecord[];
}

const toSlot = (entry: QueueEntryRecord): ActiveQueueSlot => ({
  id: entry.id,
  position: entry.position,
  state: entry.state === QueueItemState.PLAYING ? 'PLAYING' : 'QUEUED',
  requestType: entry.requestType,
});

/**
 * Every mutation here assumes the caller already holds the venue lock (`venues.lockForUpdate`)
 * inside a transaction. PostgreSQL — not the browser and not a provider playlist — is the single
 * source of truth for what plays next.
 */
@Injectable()
export class QueueService {
  constructor(@Inject(SystemSettingsService) private readonly settings: FeatureFlagSource) {}

  async snapshot(uow: UnitOfWork, venueId: string): Promise<QueueSnapshot> {
    const active = await uow.queue.listActive(venueId);
    return {
      active,
      current: active.find((entry) => entry.state === QueueItemState.PLAYING) ?? null,
      upcoming: active.filter((entry) => entry.state === QueueItemState.QUEUED),
    };
  }

  /** Places an accepted request in the queue according to its tier, shifting the rest back. */
  async enqueue(
    uow: UnitOfWork,
    venueId: string,
    songRequestId: string,
    requestType: RequestType,
  ): Promise<QueueEntryRecord> {
    const slots = (await uow.queue.listActive(venueId)).map(toSlot);
    const position = resolveInsertionPosition(slots, requestType);
    await uow.queue.shiftPositionsBy(selectPositionsToShift(slots, position), 1);
    return uow.queue.insert({ venueId, songRequestId, position });
  }

  /**
   * Applies an admin's drag-and-drop ordering. The domain rejects any list that is not an exact
   * permutation of the waiting items, so a stale browser view cannot silently drop a request.
   */
  async reorder(
    uow: UnitOfWork,
    venueId: string,
    orderedQueuedIds: readonly string[],
  ): Promise<void> {
    const slots = (await uow.queue.listActive(venueId)).map(toSlot);
    await uow.queue.applyPositions(planReorder(slots, orderedQueuedIds));
  }

  /** Removes a waiting item. The playing item is skipped, never removed. */
  async remove(
    uow: UnitOfWork,
    venueId: string,
    queueItemId: string,
    now: Date,
  ): Promise<QueueEntryRecord> {
    const entry = await uow.queue.findById(queueItemId);
    if (!entry || entry.venueId !== venueId) {
      throw new NotFoundError('Sıra kaydı bulunamadı.', 'QUEUE_ITEM_NOT_FOUND');
    }
    if (entry.state === QueueItemState.PLAYING) {
      throw new ConflictError(
        'Çalan parça sıradan çıkarılamaz, bir sonrakine geçin.',
        'QUEUE_ITEM_PLAYING',
      );
    }

    const request = await uow.songRequests.findById(entry.songRequestId);
    if (request) {
      assertRequestTransition(request.status, RequestStatus.CANCELLED);
      const cancelled = await uow.songRequests.applyStatusChange(request.id, {
        status: RequestStatus.CANCELLED,
      });
      publishRequestUpdated(uow, toSongRequestDto(cancelled), cancelled.customerSessionId);
    }
    const removed = await uow.queue.updateState(entry.id, QueueItemState.REMOVED, { endedAt: now });
    await this.compact(uow, venueId);
    return removed;
  }

  async compact(uow: UnitOfWork, venueId: string): Promise<void> {
    const slots = (await uow.queue.listActive(venueId)).map(toSlot);
    await uow.queue.applyPositions(planCompaction(slots));
  }

  /**
   * Closes the currently playing item. A skipped track is still `COMPLETED`: it did reach the
   * speakers, which is what the venue's statistics are about.
   */
  async finishCurrent(
    uow: UnitOfWork,
    venueId: string,
    now: Date,
    outcome: 'COMPLETED' | 'FAILED',
  ): Promise<QueueEntryRecord | null> {
    const current = await uow.queue.findCurrent(venueId);
    if (!current) {
      return null;
    }
    const request = await uow.songRequests.findById(current.songRequestId);
    if (request) {
      const target = outcome === 'COMPLETED' ? RequestStatus.COMPLETED : RequestStatus.FAILED;
      assertRequestTransition(request.status, target);
      const finished = await uow.songRequests.applyStatusChange(request.id, {
        status: target,
        completedAt: now,
      });
      publishRequestUpdated(uow, toSongRequestDto(finished), finished.customerSessionId);
    }
    await uow.queue.updateState(
      current.id,
      outcome === 'COMPLETED' ? QueueItemState.COMPLETED : QueueItemState.FAILED,
      { endedAt: now },
    );
    if (outcome === 'COMPLETED') {
      // A skipped track counts here too: it did reach the speakers, which is exactly the question
      // the catalogue is asking. Whether the venue liked it is a different matter.
      await uow.tracks.markPlayedOk(current.track.id, now);
    }
    return current;
  }

  /** Promotes the next waiting item to PLAYING, or parks the player in IDLE when none is left. */
  async advance(uow: UnitOfWork, venueId: string, now: Date): Promise<QueueEntryRecord | null> {
    await this.compact(uow, venueId);

    const next = await uow.queue.claimNextQueued(venueId);
    if (!next) {
      await uow.player.saveState({
        venueId,
        state: PlaybackState.IDLE,
        queueItemId: null,
        startedAt: null,
      });
      return null;
    }

    const request = await uow.songRequests.findById(next.songRequestId);
    if (request) {
      assertRequestTransition(request.status, RequestStatus.PLAYING);
      const playing = await uow.songRequests.applyStatusChange(request.id, {
        status: RequestStatus.PLAYING,
        playingAt: now,
      });
      publishRequestUpdated(uow, toSongRequestDto(playing), playing.customerSessionId);
    }
    const started = await uow.queue.updateState(next.id, QueueItemState.PLAYING, {
      startedAt: now,
    });
    await uow.player.saveState({
      venueId,
      state: PlaybackState.PLAYING,
      queueItemId: started.id,
      startedAt: now,
    });
    return started;
  }

  /**
   * Parks the player without touching the queue.
   *
   * Used when advancing would only burn through more requests: the waiting items stay `QUEUED`
   * so the venue can fix whatever is wrong and pick the evening up where it left off.
   */
  async halt(uow: UnitOfWork, venueId: string): Promise<void> {
    await this.compact(uow, venueId);
    await uow.player.saveState({
      venueId,
      state: PlaybackState.ERROR,
      queueItemId: null,
      startedAt: null,
    });
  }

  async buildNowPlaying(uow: UnitOfWork, venueId: string): Promise<NowPlayingDto> {
    const snapshot = await this.snapshot(uow, venueId);
    const state = await uow.player.getState(venueId);
    return {
      state: state?.state ?? PlaybackState.IDLE,
      track: snapshot.current ? toTrackDto(snapshot.current.track) : null,
      requestType: snapshot.current?.requestType ?? null,
      startedAt: state?.startedAt?.toISOString() ?? null,
      queueLength: snapshot.upcoming.length,
    };
  }

  /**
   * Fans the committed queue and player state out to every room. `leaseOwned` is false in a
   * broadcast because ownership is per-connection; each player tab learns it from its own
   * `/player/state` response and heartbeats.
   */
  async broadcastVenueState(uow: UnitOfWork, venueId: string): Promise<void> {
    const snapshot = await this.snapshot(uow, venueId);

    publishQueueUpdated(uow, {
      venueId,
      current: snapshot.current ? toQueueEntryDto(snapshot.current) : null,
      upcoming: snapshot.upcoming.map(toQueueEntryDto),
    });

    const state = await uow.player.getState(venueId);
    if (state) {
      publishPlayerUpdated(
        uow,
        toPlayerStateDto({
          state,
          current: snapshot.current,
          upcoming: snapshot.upcoming,
          leaseOwned: false,
          providerPlaybackEnabled: this.settings.current().features.youtubePlayback,
        }),
      );
    }

    publishNowPlaying(uow, venueId, {
      state: state?.state ?? PlaybackState.IDLE,
      track: snapshot.current ? toTrackDto(snapshot.current.track) : null,
      requestType: snapshot.current?.requestType ?? null,
      startedAt: state?.startedAt?.toISOString() ?? null,
      queueLength: snapshot.upcoming.length,
    });
  }
}
