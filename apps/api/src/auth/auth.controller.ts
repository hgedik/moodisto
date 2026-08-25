import { Body, Controller, Get, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedVenueUserDto } from '@moodisto/shared-types';
import { venueLoginSchema, type VenueLoginInput } from '@moodisto/validation';
import { DATABASE, type Database } from '../application/ports';
import { toVenueSummaryDto } from '../application/dto-mappers';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { NotFoundError } from '../common/errors';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { authCookieOptions, clearCookie, COOKIE_NAMES } from './cookies';
import { CurrentVenueUser } from './current-user.decorator';
import type { AuthenticatedVenueUser } from './authenticated-request';
import { LoginVenueUserUseCase } from './login-venue-user.usecase';
import { VenueAuthGuard } from './venue-auth.guard';
import { VenueTokenService } from './venue-token.service';

/** The guard is class-wide so that `@RateLimit` on the login route is actually enforced. */
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly login: LoginVenueUserUseCase,
    private readonly tokens: VenueTokenService,
    @Inject(DATABASE) private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('venue/login')
  @RateLimit({ bucket: 'venue-login', by: 'ip', limit: 10, windowSeconds: 300 })
  async venueLogin(
    @Body(zodBody(venueLoginSchema)) body: VenueLoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedVenueUserDto> {
    const result = await this.login.execute(body);
    response.cookie(
      COOKIE_NAMES.venueSession,
      this.tokens.sign(result.user),
      authCookieOptions(this.config.isProduction, this.config.jwt.accessTtlSeconds),
    );
    return result.dto;
  }

  @Post('venue/logout')
  @UseGuards(VenueAuthGuard)
  venueLogout(@Res({ passthrough: true }) response: Response): { ok: true } {
    clearCookie(response, COOKIE_NAMES.venueSession, this.config.isProduction);
    return { ok: true };
  }

  @Get('venue/me')
  @UseGuards(VenueAuthGuard)
  async me(@CurrentVenueUser() user: AuthenticatedVenueUser): Promise<AuthenticatedVenueUserDto> {
    const venue = await this.database.read().venues.findById(user.venueId);
    if (!venue) {
      throw new NotFoundError('Mekân bulunamadı.', 'VENUE_NOT_FOUND');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      venue: toVenueSummaryDto(venue),
    };
  }

  /** Primes the CSRF cookie for a freshly loaded browser tab. */
  @Get('session')
  session(): { ok: true } {
    return { ok: true };
  }
}
