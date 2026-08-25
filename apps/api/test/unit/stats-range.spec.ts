import { describe, expect, it } from 'vitest';
import { StatsPeriod } from '@moodisto/shared-types';
import type { StatsQuery } from '@moodisto/validation';
import { resolveStatsRange } from '../../src/admin/venue-stats.service';

const now = new Date('2026-08-25T21:30:00.000Z');

const query = (overrides: Partial<StatsQuery>): StatsQuery =>
  ({ period: StatsPeriod.TODAY, ...overrides }) as StatsQuery;

describe('resolveStatsRange', () => {
  it('starts today at local midnight and ends now', () => {
    const range = resolveStatsRange(query({ period: StatsPeriod.TODAY }), now);

    expect(range.to).toEqual(now);
    expect(range.from.getHours()).toBe(0);
    expect(range.from.getMinutes()).toBe(0);
    expect(range.from.getSeconds()).toBe(0);
    expect(range.from.getMilliseconds()).toBe(0);
    expect(range.from.getDate()).toBe(now.getDate());
  });

  it('covers the seven days before today', () => {
    const range = resolveStatsRange(query({ period: StatsPeriod.LAST_7_DAYS }), now);
    const days = (now.getTime() - range.from.getTime()) / 86_400_000;

    expect(days).toBeGreaterThan(7);
    expect(days).toBeLessThan(8);
  });

  it('covers the thirty days before today', () => {
    const range = resolveStatsRange(query({ period: StatsPeriod.LAST_30_DAYS }), now);
    const days = (now.getTime() - range.from.getTime()) / 86_400_000;

    expect(days).toBeGreaterThan(30);
    expect(days).toBeLessThan(31);
  });

  it('uses the caller supplied bounds for a custom period', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-10T00:00:00.000Z');

    expect(resolveStatsRange(query({ period: StatsPeriod.CUSTOM, from, to }), now)).toEqual({
      from,
      to,
    });
  });
});
