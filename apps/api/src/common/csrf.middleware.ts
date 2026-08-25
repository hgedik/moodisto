import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { COOKIE_NAMES, csrfCookieOptions } from '../auth/cookies';

/** Issues the double-submit CSRF token. Readable by the SPA, echoed back in `x-csrf-token`. */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const existing = request.cookies?.[COOKIE_NAMES.csrf];
    if (typeof existing !== 'string' || existing.length < 32) {
      const token = randomBytes(24).toString('base64url');
      response.cookie(COOKIE_NAMES.csrf, token, csrfCookieOptions(this.config.isProduction));
      request.cookies = { ...request.cookies, [COOKIE_NAMES.csrf]: token };
    }
    next();
  }
}
