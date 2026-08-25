import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { RateLimitDecision, RateLimiter } from '../../application/ports';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter kept in the API process. It is deliberately simple: a single instance is
 * enough for the MVP, and the `RateLimiter` port lets a Redis-backed limiter replace it when the
 * API is scaled horizontally.
 */
@Injectable()
export class InMemoryRateLimiter implements RateLimiter, OnModuleDestroy {
  private readonly windows = new Map<string, Window>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: windowSeconds };
    }

    existing.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    if (existing.count > limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
