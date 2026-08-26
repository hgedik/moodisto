import { Global, Module } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

/**
 * Global because the effective configuration is cross-cutting: the music adapter, the payment
 * adapter, the rate limiter and the request use case all ask the same question.
 */
@Global()
@Module({
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SettingsModule {}
