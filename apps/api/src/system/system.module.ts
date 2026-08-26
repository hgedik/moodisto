import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SystemSettingsController } from './system-settings.controller';

/** The operator console's API. It is reachable with a system session and nothing else. */
@Module({
  imports: [AuthModule],
  controllers: [SystemSettingsController],
})
export class SystemModule {}
