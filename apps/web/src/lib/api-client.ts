import type { ApiErrorBody } from '@moodisto/shared-types';

import { buildRequestUrl, type QueryValue } from './request-url';

/**
 * Empty on purpose when the API answers on the page's own origin — a single domain with a reverse
 * proxy in front of it. `buildRequestUrl` then keeps the call relative, and the same image works
 * behind any domain.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

const CSRF_COOKIE = 'moodisto_csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Socket.IO needs an address it can dial, and it cannot make sense of an empty string: with the
 * API on the page's own origin the socket is pointed at that origin explicitly.
 */
export const socketUrl = (): string =>
  API_URL || (typeof window === 'undefined' ? '' : window.location.origin);

/** A failure the API described in its error body, so the UI can react to `code` and not to prose. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

const readCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  for (const part of document.cookie.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1));
    }
  }
  return null;
};

/**
 * Session cookies are HttpOnly, so the tab cannot read its own credentials — by design. What it
 * can read is the CSRF cookie, which it has to echo back in a header on every mutating call.
 */
const ensureCsrfToken = async (): Promise<string> => {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) {
    return existing;
  }
  await fetch(buildRequestUrl(API_URL, '/auth/session'), { credentials: 'include' });
  return readCookie(CSRF_COOKIE) ?? '';
};

const parseErrorBody = async (response: Response): Promise<ApiError> => {
  let body: Partial<ApiErrorBody> & { details?: unknown } = {};
  try {
    body = (await response.json()) as Partial<ApiErrorBody> & { details?: unknown };
  } catch {
    // A gateway or a network appliance can answer with something that is not JSON.
  }
  return new ApiError(
    body.message ?? 'Beklenmeyen bir hata oluştu.',
    response.status,
    body.code ?? 'UNKNOWN',
    body.details,
  );
};

export interface ApiRequestInit {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly query?: Record<string, QueryValue>;
  readonly signal?: AbortSignal;
}

/**
 * The single door between the browser and the API.
 *
 * Every call carries cookies, and nothing else: there is no token in localStorage to attach, and
 * no provider key in the bundle to leak. Search, pricing and playback all go through here.
 */
export const apiFetch = async <T>(path: string, init: ApiRequestInit = {}): Promise<T> => {
  const method = init.method ?? 'GET';
  const url = buildRequestUrl(API_URL, path, init.query ?? {});

  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!SAFE_METHODS.has(method)) {
    headers[CSRF_HEADER] = await ensureCsrfToken();
  }

  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    signal: init.signal,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!response.ok) {
    throw await parseErrorBody(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Beklenmeyen bir hata oluştu.';
};
