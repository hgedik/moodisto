import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import {
  DATABASE,
  TOKEN_GENERATOR,
  type Database,
  type TokenGenerator,
} from '../application/ports';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { authCookieOptions, COOKIE_NAMES } from './cookies';
import type { MoodistoRequest } from './authenticated-request';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Gives every visitor an anonymous, server-issued identity. No name, no e-mail, no account:
 * scanning the QR code must be the only step between walking in and requesting a song.
 */
@Injectable()
export class CustomerSessionMiddleware implements NestMiddleware {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async use(request: MoodistoRequest, response: Response, next: NextFunction): Promise<void> {
    const uow = this.database.read();
    const presented = request.cookies?.[COOKIE_NAMES.customerSession];

    if (typeof presented === 'string' && presented.length > 0) {
      const existing = await uow.customerSessions.findByToken(presented);
      if (existing) {
        request.customer = {
          id: existing.id,
          sessionToken: existing.sessionToken,
          venueId: existing.venueId,
          tableLabel: existing.tableLabel,
        };
        next();
        return;
      }
    }

    const created = await uow.customerSessions.create({
      sessionToken: this.tokens.generate(24),
      venueId: null,
      tableLabel: null,
    });
    response.cookie(
      COOKIE_NAMES.customerSession,
      created.sessionToken,
      authCookieOptions(this.config.isProduction, SESSION_TTL_SECONDS),
    );
    request.customer = {
      id: created.id,
      sessionToken: created.sessionToken,
      venueId: null,
      tableLabel: null,
    };
    next();
  }
}
