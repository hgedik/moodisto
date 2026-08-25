import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { PlayerLeaseDto, PlayerStateDto } from '@moodisto/shared-types';
import {
  playerCompleteSchema,
  playerErrorSchema,
  playerSessionSchema,
  playerStartSchema,
  type PlayerCompleteInput,
  type PlayerErrorInput,
  type PlayerSessionInput,
  type PlayerStartInput,
} from '@moodisto/validation';
import { zodBody } from '../common/zod-validation.pipe';
import { CurrentVenueUser } from '../auth/current-user.decorator';
import type { AuthenticatedVenueUser } from '../auth/authenticated-request';
import { VenueAuthGuard } from '../auth/venue-auth.guard';
import { PlayerService } from './player.service';

/**
 * The player console. Every route is scoped to the authenticated user's own venue: the venue id
 * comes from the session cookie, never from the request body.
 */
@Controller('venue/player')
@UseGuards(VenueAuthGuard)
export class PlayerController {
  constructor(private readonly player: PlayerService) {}

  @Get('state')
  getState(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Query('sessionId') sessionId?: string,
  ): Promise<PlayerStateDto> {
    return this.player.getState(user.venueId, sessionId ?? null);
  }

  @Post('start')
  start(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerStartSchema)) body: PlayerStartInput,
  ): Promise<PlayerStateDto> {
    return this.player.start(user.venueId, body);
  }

  @Post('complete')
  complete(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerCompleteSchema)) body: PlayerCompleteInput,
  ): Promise<PlayerStateDto> {
    return this.player.complete(user.venueId, body);
  }

  @Post('error')
  reportError(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerErrorSchema)) body: PlayerErrorInput,
  ): Promise<PlayerStateDto> {
    return this.player.reportError(user.venueId, body);
  }

  @Post('next')
  next(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerSessionSchema)) body: PlayerSessionInput,
  ): Promise<PlayerStateDto> {
    return this.player.skip(user.venueId, body.sessionId);
  }

  @Post('pause')
  pause(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerSessionSchema)) body: PlayerSessionInput,
  ): Promise<PlayerStateDto> {
    return this.player.pause(user.venueId, body.sessionId);
  }

  @Post('resume')
  resume(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerSessionSchema)) body: PlayerSessionInput,
  ): Promise<PlayerStateDto> {
    return this.player.resume(user.venueId, body.sessionId);
  }

  @Post('heartbeat')
  heartbeat(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerSessionSchema)) body: PlayerSessionInput,
  ): Promise<PlayerLeaseDto> {
    return this.player.heartbeat(user.venueId, body.sessionId);
  }

  @Post('release')
  async release(
    @CurrentVenueUser() user: AuthenticatedVenueUser,
    @Body(zodBody(playerSessionSchema)) body: PlayerSessionInput,
  ): Promise<{ released: true }> {
    await this.player.release(user.venueId, body.sessionId);
    return { released: true };
  }
}
