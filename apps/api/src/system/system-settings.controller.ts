import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { SystemSettingsResponse } from '@moodisto/shared-types';
import { updateSystemSettingsSchema, type SystemSettingsUpdate } from '@moodisto/validation';
import type { AuthenticatedSystemUser } from '../auth/authenticated-request';
import { CurrentSystemUser } from '../auth/current-user.decorator';
import { SystemAuthGuard } from '../auth/system-auth.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { SystemSettingsService } from '../settings/system-settings.service';
import { toSystemSettingDtos } from '../settings/settings-view';
import type { EffectiveSettings } from '../settings/settings-resolver';

/**
 * The operator's view of what this installation is configured to do.
 *
 * Everything here is masked on the way out: the panel learns that a credential exists and how it
 * ends, never what it is. Writing one back takes effect on the next request, without a deploy.
 */
@Controller('system/settings')
@UseGuards(SystemAuthGuard)
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get()
  async list(): Promise<SystemSettingsResponse> {
    return this.toResponse(await this.settings.effective());
  }

  @Patch()
  async update(
    @Body(zodBody(updateSystemSettingsSchema)) body: SystemSettingsUpdate,
    @CurrentSystemUser() user: AuthenticatedSystemUser,
  ): Promise<SystemSettingsResponse> {
    return this.toResponse(await this.settings.update(body, user.id));
  }

  private toResponse(effective: EffectiveSettings): SystemSettingsResponse {
    return { settings: toSystemSettingDtos(effective, (key) => this.settings.writtenAt(key)) };
  }
}
