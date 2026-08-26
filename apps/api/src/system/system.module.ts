import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { VenuesModule } from '../venues/venues.module';
import { SystemSettingsController } from './system-settings.controller';
import { ProvisionVenueUseCase } from './provision-venue.usecase';
import { SystemVenuesController } from './system-venues.controller';
import { SystemVenuesService } from './system-venues.service';

/** The operator console's API. It is reachable with a system session and nothing else. */
@Module({
  imports: [AdminModule, AuthModule, VenuesModule],
  controllers: [SystemSettingsController, SystemVenuesController],
  providers: [ProvisionVenueUseCase, SystemVenuesService],
})
export class SystemModule {}
