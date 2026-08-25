import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { CreateSongRequestResponse, SongRequestDto } from '@moodisto/shared-types';
import {
  createSongRequestSchema,
  cuidSchema,
  venueSlugSchema,
  type CreateSongRequestInput,
} from '@moodisto/validation';
import { DATABASE, type Database } from '../application/ports';
import { toSongRequestDto } from '../application/dto-mappers';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentCustomer } from '../auth/current-user.decorator';
import type { CustomerIdentity } from '../auth/authenticated-request';
import { CreateSongRequestUseCase } from './create-song-request.usecase';
import { ModerateSongRequestUseCase } from './moderate-song-request.usecase';

@Controller()
@UseGuards(RateLimitGuard)
export class RequestsController {
  constructor(
    private readonly create: CreateSongRequestUseCase,
    private readonly moderate: ModerateSongRequestUseCase,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  @Post('venues/:slug/requests')
  @RateLimit(
    {
      bucket: 'create-request',
      by: 'customer',
      limit: 5,
      windowSeconds: 600,
      message: 'Kısa sürede çok fazla istek gönderdiniz, lütfen biraz bekleyin.',
    },
    { bucket: 'create-request-ip', by: 'ip', limit: 20, windowSeconds: 3600 },
  )
  createRequest(
    @Param('slug', zodBody(venueSlugSchema)) slug: string,
    @Body(zodBody(createSongRequestSchema)) body: CreateSongRequestInput,
    @CurrentCustomer() customer: CustomerIdentity,
  ): Promise<CreateSongRequestResponse> {
    return this.create.execute(slug, body, customer);
  }

  /** Only the session that created a request may read it: request ids are not public. */
  @Get('requests/:requestId')
  async getRequest(
    @Param('requestId', zodBody(cuidSchema)) requestId: string,
    @CurrentCustomer() customer: CustomerIdentity,
  ): Promise<SongRequestDto> {
    const request = await this.database.read().songRequests.findById(requestId);
    if (!request) {
      throw new NotFoundError('İstek bulunamadı.', 'REQUEST_NOT_FOUND');
    }
    if (request.customerSessionId !== customer.id) {
      throw new ForbiddenError('Bu istek size ait değil.');
    }
    return toSongRequestDto(request);
  }

  @Post('requests/:requestId/cancel')
  cancelRequest(
    @Param('requestId', zodBody(cuidSchema)) requestId: string,
    @CurrentCustomer() customer: CustomerIdentity,
  ): Promise<SongRequestDto> {
    return this.moderate.cancelByCustomer(customer.id, requestId);
  }

  @Get('venues/:slug/my-requests')
  async myRequests(
    @Param('slug', zodBody(venueSlugSchema)) slug: string,
    @CurrentCustomer() customer: CustomerIdentity,
  ): Promise<readonly SongRequestDto[]> {
    const uow = this.database.read();
    const venue = await uow.venues.findBySlug(slug);
    if (!venue) {
      throw new NotFoundError('Mekân bulunamadı.', 'VENUE_NOT_FOUND');
    }
    const requests = await uow.songRequests.listForCustomerSession(customer.id, venue.id, 20);
    return requests.map(toSongRequestDto);
  }
}
