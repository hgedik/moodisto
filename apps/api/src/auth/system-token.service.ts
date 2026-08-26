import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { UnauthorizedError } from '../common/errors';
import type { AuthenticatedSystemUser } from './authenticated-request';

const SYSTEM_SCOPE = 'system';

interface SystemTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly name: string;
  readonly scope: typeof SYSTEM_SCOPE;
}

/**
 * The system session is a different session, not a more powerful venue one.
 *
 * It is signed with its own derived secret and carries its own scope, so neither kind of token can
 * ever be verified as the other — a venue owner's cookie cannot become an operator's.
 */
@Injectable()
export class SystemTokenService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.secret = `${config.jwt.secret}:${SYSTEM_SCOPE}`;
  }

  sign(user: AuthenticatedSystemUser): string {
    const claims: SystemTokenClaims = {
      sub: user.id,
      email: user.email,
      name: user.name,
      scope: SYSTEM_SCOPE,
    };
    return this.jwt.sign(claims, {
      secret: this.secret,
      expiresIn: this.config.jwt.accessTtlSeconds,
    });
  }

  verify(token: string): AuthenticatedSystemUser {
    try {
      const claims = this.jwt.verify<SystemTokenClaims>(token, { secret: this.secret });
      if (claims.scope !== SYSTEM_SCOPE) {
        throw new Error('scope');
      }
      return { id: claims.sub, email: claims.email, name: claims.name };
    } catch {
      throw new UnauthorizedError('Oturum süresi dolmuş, lütfen tekrar giriş yapın.');
    }
  }
}
