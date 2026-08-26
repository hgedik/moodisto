import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type {
  CreatedVenueDto,
  PaginatedResponse,
  SystemVenueDetailDto,
  SystemVenueDto,
  VenueDetailDto,
} from '@moodisto/shared-types';
import {
  createVenueSchema,
  cuidSchema,
  systemVenuesQuerySchema,
  updateVenueSettingsSchema,
  type CreateVenueInput,
  type SystemVenuesQuery,
  type UpdateVenueSettingsInput,
} from '@moodisto/validation';
import { SystemAuthGuard } from '../auth/system-auth.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { VenueAdminService } from '../admin/venue-admin.service';
import { ProvisionVenueUseCase } from './provision-venue.usecase';
import { SystemVenuesService } from './system-venues.service';

/**
 * Where a café is taken on and kept up to date.
 *
 * Editing goes through the same service the venue's own console uses, so a venue's settings mean
 * exactly one thing no matter who changed them.
 */
@Controller('system/venues')
@UseGuards(SystemAuthGuard)
export class SystemVenuesController {
  constructor(
    private readonly venues: SystemVenuesService,
    private readonly provision: ProvisionVenueUseCase,
    private readonly admin: VenueAdminService,
  ) {}

  @Get()
  list(
    @Query(zodBody(systemVenuesQuerySchema)) query: SystemVenuesQuery,
  ): Promise<PaginatedResponse<SystemVenueDto>> {
    return this.venues.list(query);
  }

  @Post()
  create(@Body(zodBody(createVenueSchema)) body: CreateVenueInput): Promise<CreatedVenueDto> {
    return this.provision.execute(body);
  }

  @Get(':venueId')
  detail(@Param('venueId', zodBody(cuidSchema)) venueId: string): Promise<SystemVenueDetailDto> {
    return this.venues.detail(venueId);
  }

  @Patch(':venueId')
  update(
    @Param('venueId', zodBody(cuidSchema)) venueId: string,
    @Body(zodBody(updateVenueSettingsSchema)) body: UpdateVenueSettingsInput,
  ): Promise<VenueDetailDto> {
    return this.admin.updateSettings(venueId, body);
  }
}
