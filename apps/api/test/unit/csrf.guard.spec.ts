import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { CsrfGuard } from '../../src/common/csrf.guard';
import { ForbiddenError } from '../../src/common/errors';
import { COOKIE_NAMES } from '../../src/auth/cookies';
import { SKIP_CSRF } from '../../src/common/skip-csrf.decorator';

interface RequestShape {
  method: string;
  cookies?: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
}

const contextFor = (request: RequestShape, skip = false): ExecutionContext => {
  const handler = (): void => undefined;
  if (skip) {
    Reflect.defineMetadata(SKIP_CSRF, true, handler);
  }
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
};

const guard = new CsrfGuard(new Reflector());

describe('CsrfGuard', () => {
  it('lets safe methods through without a token', () => {
    expect(guard.canActivate(contextFor({ method: 'GET', headers: {} }))).toBe(true);
  });

  it('accepts a mutation whose header echoes the cookie', () => {
    const request = {
      method: 'POST',
      cookies: { [COOKIE_NAMES.csrf]: 'token-value-1234567890' },
      headers: { 'x-csrf-token': 'token-value-1234567890' },
    };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('rejects a mutation with no header, which is what a cross-site form can produce', () => {
    const request = {
      method: 'POST',
      cookies: { [COOKIE_NAMES.csrf]: 'token-value-1234567890' },
      headers: {},
    };
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenError);
  });

  it('rejects a mutation whose header does not match the cookie', () => {
    const request = {
      method: 'POST',
      cookies: { [COOKIE_NAMES.csrf]: 'token-value-1234567890' },
      headers: { 'x-csrf-token': 'another-token-0987654321' },
    };
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenError);
  });

  it('rejects a mutation with no cookie at all', () => {
    const request = { method: 'POST', headers: { 'x-csrf-token': 'token-value-1234567890' } };
    expect(() => guard.canActivate(contextFor(request))).toThrow(ForbiddenError);
  });

  it('skips the check on routes marked @SkipCsrf, such as the payment webhook', () => {
    const request = { method: 'POST', headers: {} };
    expect(guard.canActivate(contextFor(request, true))).toBe(true);
  });
});
