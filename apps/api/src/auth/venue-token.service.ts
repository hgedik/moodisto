import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { VenueUserRole } from '@moodisto/shared-types';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { UnauthorizedError } from '../common/errors';
import type { AuthenticatedVenueUser } from './authenticated-request';

interface VenueTokenClaims {
  readonly sub: string;
  readonly venueId: string;
  readonly email: string;
  readonly name: string;
  readonly role: VenueUserRole;
}

@Injectable()
export class VenueTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  sign(user: AuthenticatedVenueUser): string {
    const claims: VenueTokenClaims = {
      sub: user.id,
      venueId: user.venueId,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    return this.jwt.sign(claims, {
      secret: this.config.jwt.secret,
      expiresIn: this.config.jwt.accessTtlSeconds,
    });
  }

  verify(token: string): AuthenticatedVenueUser {
    try {
      const claims = this.jwt.verify<VenueTokenClaims>(token, { secret: this.config.jwt.secret });
      return {
        id: claims.sub,
        venueId: claims.venueId,
        email: claims.email,
        name: claims.name,
        role: claims.role,
      };
    } catch {
      throw new UnauthorizedError('Oturum süresi dolmuş, lütfen tekrar giriş yapın.');
    }
  }
}
