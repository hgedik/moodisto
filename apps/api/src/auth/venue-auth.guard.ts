import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { VenueUserRole } from '@moodisto/shared-types';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { COOKIE_NAMES } from './cookies';
import type { MoodistoRequest } from './authenticated-request';
import { REQUIRED_ROLES } from './roles.decorator';
import { VenueTokenService } from './venue-token.service';

@Injectable()
export class VenueAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: VenueTokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<MoodistoRequest>();
    const token = request.cookies?.[COOKIE_NAMES.venueSession];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedError();
    }

    const user = this.tokens.verify(token);
    request.venueUser = user;

    const required = this.reflector.getAllAndOverride<readonly VenueUserRole[] | undefined>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (required && required.length > 0 && !required.includes(user.role)) {
      throw new ForbiddenError('Bu işlem için rolünüz yeterli değil.');
    }
    return true;
  }
}
