import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  VenueUserRole,
  type BlockedRuleDto,
  type PaginatedResponse,
  type QrCodeDto,
  type QueueUpdatedPayload,
  type SongRequestDto,
  type VenueDetailDto,
  type VenuePricingDto,
  type VenueStatsDto,
} from '@moodisto/shared-types';
import {
  adminRequestsQuerySchema,
  createBlockedRuleSchema,
  createQrCodeSchema,
  cuidSchema,
  rejectSongRequestSchema,
  reorderQueueSchema,
  statsQuerySchema,
  updateVenuePricingSchema,
  updateVenueSettingsSchema,
  type AdminRequestsQuery,
  type CreateBlockedRuleInput,
  type CreateQrCodeInput,
  type RejectSongRequestInput,
  type ReorderQueueInput,
  type StatsQuery,
  type UpdateVenuePricingInput,
  type UpdateVenueSettingsInput,
} from '@moodisto/validation';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentVenueUser } from '../auth/current-user.decorator';
import type { AuthenticatedVenueUser } from '../auth/authenticated-request';
import { Roles } from '../auth/roles.decorator';
import { VenueAuthGuard } from '../auth/venue-auth.guard';
import { ModerateSongRequestUseCase } from '../requests/moderate-song-request.usecase';
import { AdminQueueService } from './admin-queue.service';
import { VenueAdminService } from './venue-admin.service';
import { VenueStatsService } from './venue-stats.service';

/**
 * The venue console API. The venue id always comes from the authenticated session, so no route
 * here can be pointed at another venue's data.
 */
@Controller('venue')
@UseGuards(VenueAuthGuard)
export class AdminController {
  constructor(
    private readonly admin: VenueAdminService,
    private readonly queue: AdminQueueService,
    private readonly stats: VenueStatsService,
    private readonly moderate: ModerateSongRequestUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('requests')
  listRequests(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Query(zodBody(adminRequestsQuerySchema)) query: AdminRequestsQuery,
  ): Promise<PaginatedResponse<SongRequestDto>> {
    return this.admin.listRequests(user.venueId, query);
  }

  @Post('requests/:requestId/accept')
  acceptRequest(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Param('requestId', zodBody(cuidSchema)) requestId: string,
  ): Promise<SongRequestDto> {
    return this.moderate.accept(user.venueId, requestId);
  }

  @Post('requests/:requestId/reject')
  rejectRequest(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Param('requestId', zodBody(cuidSchema)) requestId: string,
    @Body(zodBody(rejectSongRequestSchema)) body: RejectSongRequestInput,
  ): Promise<SongRequestDto> {
    return this.moderate.reject(user.venueId, requestId, body.reason ?? null);
  }

  @Get('queue')
  readQueue(@CurrentVenueUser() user: AuthenticatedVenueUser): Promise<QueueUpdatedPayload> {
    return this.queue.read(user.venueId);
  }

  @Post('queue/reorder')
  reorderQueue(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(reorderQueueSchema)) body: ReorderQueueInput,
  ): Promise<QueueUpdatedPayload> {
    return this.queue.reorder(user.venueId, body.items);
  }

  @Delete('queue/:queueItemId')
  removeQueueItem(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Param('queueItemId', zodBody(cuidSchema)) queueItemId: string,
  ): Promise<QueueUpdatedPayload> {
    return this.queue.remove(user.venueId, queueItemId);
  }

  @Get('settings')
  readSettings(@CurrentVenueUser() user: AuthenticatedVenueUser): Promise<VenueDetailDto> {
    return this.admin.detail(user.venueId);
  }

  @Patch('settings')
  @Roles(VenueUserRole.OWNER, VenueUserRole.MANAGER)
  updateSettings(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(updateVenueSettingsSchema)) body: UpdateVenueSettingsInput,
  ): Promise<VenueDetailDto> {
    return this.admin.updateSettings(user.venueId, body);
  }

  @Get('pricing')
  readPricing(@CurrentVenueUser() user: AuthenticatedVenueUser): Promise<VenuePricingDto> {
    return this.admin.pricing(user.venueId);
  }

  @Patch('pricing')
  @Roles(VenueUserRole.OWNER, VenueUserRole.MANAGER)
  updatePricing(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(updateVenuePricingSchema)) body: UpdateVenuePricingInput,
  ): Promise<VenuePricingDto> {
    return this.admin.updatePricing(user.venueId, body);
  }

  @Get('filters')
  listFilters(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
  ): Promise<readonly BlockedRuleDto[]> {
    return this.admin.listBlockedRules(user.venueId);
  }

  @Post('filters')
  createFilter(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(createBlockedRuleSchema)) body: CreateBlockedRuleInput,
  ): Promise<BlockedRuleDto> {
    return this.admin.createBlockedRule(user.venueId, body);
  }

  @Delete('filters/:ruleId')
  async removeFilter(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Param('ruleId', zodBody(cuidSchema)) ruleId: string,
  ): Promise<{ removed: true }> {
    await this.admin.removeBlockedRule(user.venueId, ruleId);
    return { removed: true };
  }

  @Get('qr-codes')
  listQrCodes(@CurrentVenueUser() user: AuthenticatedVenueUser): Promise<readonly QrCodeDto[]> {
    return this.admin.listQrCodes(user.venueId, this.config.appUrl);
  }

  @Post('qr-codes')
  @Roles(VenueUserRole.OWNER, VenueUserRole.MANAGER)
  createQrCode(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(createQrCodeSchema)) body: CreateQrCodeInput,
  ): Promise<QrCodeDto> {
    return this.admin.createQrCode(user.venueId, body, this.config.appUrl);
  }

  @Delete('qr-codes/:qrCodeId')
  @Roles(VenueUserRole.OWNER, VenueUserRole.MANAGER)
  async deactivateQrCode(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Param('qrCodeId', zodBody(cuidSchema)) qrCodeId: string,
  ): Promise<{ deactivated: true }> {
    await this.admin.deactivateQrCode(user.venueId, qrCodeId);
    return { deactivated: true };
  }

  @Get('stats')
  readStats(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Query(zodBody(statsQuerySchema)) query: StatsQuery,
  ): Promise<VenueStatsDto> {
    return this.stats.execute(user.venueId, query);
  }
}
