import { Inject, Injectable } from '@nestjs/common';
import { PlayerCommand, type QueueUpdatedPayload } from '@moodisto/shared-types';
import { CLOCK, DATABASE, type Clock, type Database } from '../application/ports';
import { toQueueEntryDto } from '../application/dto-mappers';
import { publishPlayerCommand } from '../application/services/realtime-messages';
import { QueueService } from '../queue/queue.service';

/** Queue editing from the venue console. Every mutation runs under the venue lock. */
@Injectable()
export class AdminQueueService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly queue: QueueService,
  ) {}

  async read(venueId: string): Promise<QueueUpdatedPayload> {
    const snapshot = await this.queue.snapshot(this.database.read(), venueId);
    return {
      venueId,
      current: snapshot.current ? toQueueEntryDto(snapshot.current) : null,
      upcoming: snapshot.upcoming.map(toQueueEntryDto),
    };
  }

  async reorder(
    venueId: string,
    orderedQueuedIds: readonly string[],
  ): Promise<QueueUpdatedPayload> {
    return this.database.transaction(async (uow) => {
      await uow.venues.lockForUpdate(venueId);
      await this.queue.reorder(uow, venueId, orderedQueuedIds);
      await this.queue.broadcastVenueState(uow, venueId);

      const snapshot = await this.queue.snapshot(uow, venueId);
      return {
        venueId,
        current: snapshot.current ? toQueueEntryDto(snapshot.current) : null,
        upcoming: snapshot.upcoming.map(toQueueEntryDto),
      };
    });
  }

  async remove(venueId: string, queueItemId: string): Promise<QueueUpdatedPayload> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      await uow.venues.lockForUpdate(venueId);
      await this.queue.remove(uow, venueId, queueItemId, now);
      await this.queue.broadcastVenueState(uow, venueId);
      publishPlayerCommand(uow, venueId, PlayerCommand.Reload, now);

      const snapshot = await this.queue.snapshot(uow, venueId);
      return {
        venueId,
        current: snapshot.current ? toQueueEntryDto(snapshot.current) : null,
        upcoming: snapshot.upcoming.map(toQueueEntryDto),
      };
    });
  }
}
