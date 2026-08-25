import { Inject, Injectable } from '@nestjs/common';
import { assertRequestTransition } from '@moodisto/queue-engine';
import { RequestStatus, type SongRequestDto } from '@moodisto/shared-types';
import { CLOCK, DATABASE, type Clock, type Database } from '../application/ports';
import { toSongRequestDto } from '../application/dto-mappers';
import { publishRequestUpdated } from '../application/services/realtime-messages';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { PlayerService } from '../player/player.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ModerateSongRequestUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queue: QueueService,
    private readonly player: PlayerService,
  ) {}

  /**
   * Accepting is one transaction: PENDING → ACCEPTED → QUEUED plus the queue insertion. A crash
   * halfway through can therefore never leave an accepted request that is not in the queue.
   */
  async accept(venueId: string, requestId: string): Promise<SongRequestDto> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      await uow.venues.lockForUpdate(venueId);
      const request = await this.require(uow, venueId, requestId);

      assertRequestTransition(request.status, RequestStatus.ACCEPTED);
      await uow.songRequests.applyStatusChange(request.id, {
        status: RequestStatus.ACCEPTED,
        acceptedAt: now,
      });

      await this.queue.enqueue(uow, venueId, request.id, request.requestType);
      const queued = await uow.songRequests.applyStatusChange(request.id, {
        status: RequestStatus.QUEUED,
        queuedAt: now,
      });

      const dto = toSongRequestDto(queued);
      publishRequestUpdated(uow, dto);

      // A player tab waiting on an empty queue has nothing to react to on its own, so the server
      // puts the song it just accepted on the speakers before telling everyone where things stand.
      await this.player.startNextIfIdle(uow, venueId, now);
      await this.queue.broadcastVenueState(uow, venueId);

      return dto;
    });
  }

  async reject(venueId: string, requestId: string, reason: string | null): Promise<SongRequestDto> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      const request = await this.require(uow, venueId, requestId);
      assertRequestTransition(request.status, RequestStatus.REJECTED);

      const rejected = await uow.songRequests.applyStatusChange(request.id, {
        status: RequestStatus.REJECTED,
        rejectedAt: now,
        rejectionReason: reason,
      });
      const dto = toSongRequestDto(rejected);
      publishRequestUpdated(uow, dto);
      return dto;
    });
  }

  /** A guest may withdraw their own request while the venue has not acted on it yet. */
  async cancelByCustomer(customerSessionId: string, requestId: string): Promise<SongRequestDto> {
    return this.database.transaction(async (uow) => {
      const request = await uow.songRequests.findById(requestId);
      if (!request) {
        throw new NotFoundError('İstek bulunamadı.', 'REQUEST_NOT_FOUND');
      }
      if (request.customerSessionId !== customerSessionId) {
        throw new ForbiddenError('Bu istek size ait değil.');
      }
      assertRequestTransition(request.status, RequestStatus.CANCELLED);

      const cancelled = await uow.songRequests.applyStatusChange(request.id, {
        status: RequestStatus.CANCELLED,
      });
      const dto = toSongRequestDto(cancelled);
      publishRequestUpdated(uow, dto);
      return dto;
    });
  }

  private async require(
    uow: Awaited<ReturnType<Database['read']>>,
    venueId: string,
    requestId: string,
  ) {
    const request = await uow.songRequests.findById(requestId);
    if (!request || request.venueId !== venueId) {
      throw new NotFoundError('İstek bulunamadı.', 'REQUEST_NOT_FOUND');
    }
    return request;
  }
}
