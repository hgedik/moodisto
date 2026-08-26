import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequestsModule } from '../requests/requests.module';
import { VenuesModule } from '../venues/venues.module';
import { AdminController } from './admin.controller';
import { AdminQueueService } from './admin-queue.service';
import { VenueAdminService } from './venue-admin.service';
import { VenueStatsService } from './venue-stats.service';

@Module({
  imports: [AuthModule, RequestsModule, VenuesModule],
  controllers: [AdminController],
  providers: [VenueAdminService, AdminQueueService, VenueStatsService],
  exports: [VenueAdminService],
})
export class AdminModule {}
