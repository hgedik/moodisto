import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimiter } from '../../src/infrastructure/services/in-memory-rate-limiter';

describe('InMemoryRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows exactly `limit` calls inside one window', async () => {
    const limiter = new InMemoryRateLimiter();

    const decisions = [];
    for (let i = 0; i < 4; i += 1) {
      decisions.push(await limiter.consume('bucket:ip:1.2.3.4', 3, 60));
    }

    expect(decisions.map((decision) => decision.allowed)).toEqual([true, true, true, false]);
    expect(decisions[2]?.remaining).toBe(0);
    expect(decisions[3]?.retryAfterSeconds).toBeGreaterThan(0);
    limiter.onModuleDestroy();
  });

  it('counts each key separately', async () => {
    const limiter = new InMemoryRateLimiter();

    await limiter.consume('a', 1, 60);
    const other = await limiter.consume('b', 1, 60);

    expect(other.allowed).toBe(true);
    limiter.onModuleDestroy();
  });

  it('starts a fresh window once the old one has elapsed', async () => {
    vi.useFakeTimers();
    const limiter = new InMemoryRateLimiter();

    await limiter.consume('key', 1, 60);
    expect((await limiter.consume('key', 1, 60)).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect((await limiter.consume('key', 1, 60)).allowed).toBe(true);
    limiter.onModuleDestroy();
  });
});
