import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ForbiddenError } from './errors';
import { COOKIE_NAMES } from '../auth/cookies';
import { SKIP_CSRF } from './skip-csrf.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const equals = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Double-submit CSRF check. A cross-site page can make the browser send our cookies, but it
 * cannot read them, so it cannot reproduce the header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_CSRF, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip === true) {
      return true;
    }

    const cookie = request.cookies?.[COOKIE_NAMES.csrf];
    const header = request.headers['x-csrf-token'];
    const presented = Array.isArray(header) ? header[0] : header;

    if (typeof cookie !== 'string' || typeof presented !== 'string' || !equals(cookie, presented)) {
      throw new ForbiddenError('CSRF doğrulaması başarısız.', 'CSRF_FAILED');
    }
    return true;
  }
}
