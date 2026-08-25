import type { CookieOptions, Response } from 'express';

export const COOKIE_NAMES = {
  venueSession: 'moodisto_venue',
  customerSession: 'moodisto_customer',
  csrf: 'moodisto_csrf',
} as const;

/**
 * Auth tokens live in HttpOnly cookies, never in localStorage: a stored token is readable by any
 * script that manages to run on the page, an HttpOnly cookie is not.
 */
export const authCookieOptions = (isProduction: boolean, maxAgeSeconds: number): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: maxAgeSeconds * 1000,
});

/** The CSRF cookie is intentionally readable: the browser must echo it back in a header. */
export const csrfCookieOptions = (isProduction: boolean): CookieOptions => ({
  httpOnly: false,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
});

export const clearCookie = (response: Response, name: string, isProduction: boolean): void => {
  response.clearCookie(name, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
};
