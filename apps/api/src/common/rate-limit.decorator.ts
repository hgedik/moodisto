import { SetMetadata } from '@nestjs/common';

export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
  /** `ip` throttles a network location; `customer` throttles one anonymous guest session. */
  readonly by: 'ip' | 'customer';
  readonly bucket: string;
  readonly message?: string;
}

export const RATE_LIMIT_RULES = 'moodisto:rate-limit';

export const RateLimit = (...rules: readonly RateLimitRule[]) =>
  SetMetadata(RATE_LIMIT_RULES, rules);
