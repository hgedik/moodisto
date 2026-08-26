import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type {
  CreatedVenueDto,
  CreatedVenueUserDto,
  PasswordResetDto,
  PaginatedResponse,
  SystemVenueDetailDto,
  SystemVenueDto,
  VenueDetailDto,
  VenueUserDto,
} from '@moodisto/shared-types';
import {
  createVenueSchema,
  createVenueUserSchema,
  cuidSchema,
  systemVenuesQuerySchema,
  updateVenueSettingsSchema,
  updateVenueUserSchema,
  type CreateVenueInput,
  type CreateVenueUserInput,
  type SystemVenuesQuery,
  type UpdateVenueSettingsInput,
  type UpdateVenueUserInput,
} from '@moodisto/validation';
import { SystemAuthGuard } from '../auth/system-auth.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { VenueAdminService } from '../admin/venue-admin.service';
import { ProvisionVenueUseCase } from './provision-venue.usecase';
import { SystemVenuesService } from './system-venues.service';
import { VenueUsersService } from './venue-users.service';

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
    private readonly users: VenueUsersService,
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

  @Get(':venueId/users')
  listUsers(
    @Param('venueId', zodBody(cuidSchema)) venueId: string,
  ): Promise<readonly VenueUserDto[]> {
    return this.users.list(venueId);
  }

  @Post(':venueId/users')
  createUser(
    @Param('venueId', zodBody(cuidSchema)) venueId: string,
    @Body(zodBody(createVenueUserSchema)) body: CreateVenueUserInput,
  ): Promise<CreatedVenueUserDto> {
    return this.users.create(venueId, body);
  }

  @Patch(':venueId/users/:userId')
  updateUser(
    @Param('venueId', zodBody(cuidSchema)) venueId: string,
    @Param('userId', zodBody(cuidSchema)) userId: string,
    @Body(zodBody(updateVenueUserSchema)) body: UpdateVenueUserInput,
  ): Promise<VenueUserDto> {
    return this.users.update(venueId, userId, body);
  }

  @Post(':venueId/users/:userId/password')
  resetUserPassword(
    @Param('venueId', zodBody(cuidSchema)) venueId: string,
    @Param('userId', zodBody(cuidSchema)) userId: string,
  ): Promise<PasswordResetDto> {
    return this.users.resetPassword(venueId, userId);
  }
}
