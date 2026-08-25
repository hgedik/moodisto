import type { PaymentStatus } from '@moodisto/shared-types';

export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('CLOCK');

export interface TokenGenerator {
  /** URL-safe opaque token used for QR codes and anonymous customer sessions. */
  generate(byteLength?: number): string;
}
export const TOKEN_GENERATOR = Symbol('TOKEN_GENERATOR');

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}
export const RATE_LIMITER = Symbol('RATE_LIMITER');

export interface PaymentIntent {
  readonly requestId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly returnUrl: string;
}

export interface PaymentSession {
  readonly providerPaymentId: string;
  readonly status: PaymentStatus;
  readonly checkoutUrl: string | null;
  readonly checkoutFormContent: string | null;
  readonly expiresAt: Date | null;
}

export interface PaymentWebhookResult {
  readonly providerPaymentId: string;
  readonly status: PaymentStatus;
  readonly rawPayload: unknown;
}

/**
 * Payment stays behind a port so the venue can switch PSPs without touching request handling.
 * Callbacks are never trusted from the browser; only `handleWebhook` can move money forward.
 */
export interface PaymentProvider {
  readonly id: string;
  createSession(intent: PaymentIntent): Promise<PaymentSession>;
  /** Verifies the signature and returns the settled state, or throws when verification fails. */
  handleWebhook(rawBody: string, headers: Record<string, string | undefined>): PaymentWebhookResult;
}
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
