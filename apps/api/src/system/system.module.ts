import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { VenuesModule } from '../venues/venues.module';
import { SystemSettingsController } from './system-settings.controller';
import { ProvisionVenueUseCase } from './provision-venue.usecase';
import { SystemVenuesController } from './system-venues.controller';
import { SystemUsersController } from './system-users.controller';
import { SystemUsersService } from './system-users.service';
import { SystemVenuesService } from './system-venues.service';
import { VenueUsersService } from './venue-users.service';

/** The operator console's API. It is reachable with a system session and nothing else. */
@Module({
  imports: [AdminModule, AuthModule, VenuesModule],
  controllers: [SystemSettingsController, SystemVenuesController, SystemUsersController],
  providers: [ProvisionVenueUseCase, SystemVenuesService, VenueUsersService, SystemUsersService],
})
export class SystemModule {}
