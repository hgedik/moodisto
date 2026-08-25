import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { JoinVenueUseCase } from './join-venue.usecase';
import { VenueLookupService } from './venue-lookup.service';
import { VenueQueriesService } from './venue-queries.service';
import { VenuesController } from './venues.controller';

@Module({
  imports: [QueueModule],
  controllers: [VenuesController],
  providers: [JoinVenueUseCase, VenueLookupService, VenueQueriesService],
  exports: [VenueLookupService, VenueQueriesService],
})
export class VenuesModule {}
