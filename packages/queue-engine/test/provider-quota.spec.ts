import { describe, expect, it } from 'vitest';
import {
  affordableSearches,
  quotaPeriodKey,
  secondsUntilQuotaReset,
  spendableUnits,
  type ProviderQuotaSnapshot,
} from '../src/quota/provider-quota';

const snapshot = (overrides: Partial<ProviderQuotaSnapshot> = {}): ProviderQuotaSnapshot => ({
  dailyUnits: 10_000,
  spentUnits: 0,
  reserveUnits: 500,
  ...overrides,
});

describe('spendableUnits', () => {
  it('holds the reserve back from what search may spend', () => {
    expect(spendableUnits(snapshot())).toBe(9_500);
  });

  it('counts what has already been spent', () => {
    expect(spendableUnits(snapshot({ spentUnits: 4_000 }))).toBe(5_500);
  });

  it('never reports a negative allowance once the reserve is being eaten into', () => {
    // The lookups a request needs may dip into the reserve; search must simply see nothing left.
    expect(spendableUnits(snapshot({ spentUnits: 9_800 }))).toBe(0);
  });
});

describe('affordableSearches', () => {
  it('reports whole searches only, because half a search buys nothing', () => {
    expect(affordableSearches(snapshot({ spentUnits: 9_400 }), 101)).toBe(0);
    expect(affordableSearches(snapshot({ spentUnits: 9_300 }), 101)).toBe(1);
  });

  it('reports the whole day at the start of it', () => {
    expect(affordableSearches(snapshot(), 101)).toBe(94);
  });

  it('treats a free provider as unlimited rather than dividing by zero', () => {
    expect(affordableSearches(snapshot(), 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('quotaPeriodKey', () => {
  it('groups by the provider’s own day, not by UTC', () => {
    // 22:00 on the 25th in Los Angeles is already the 26th in UTC; the allowance is still the
    // 25th's, and billing it to the 26th would hand out a second day of quota every evening.
    expect(quotaPeriodKey(new Date('2026-08-26T05:00:00.000Z'), 'America/Los_Angeles')).toBe(
      '2026-08-25',
    );
  });

  it('rolls over exactly when the provider resets', () => {
    expect(quotaPeriodKey(new Date('2026-08-26T07:00:00.000Z'), 'America/Los_Angeles')).toBe(
      '2026-08-26',
    );
  });

  it('reads the same instant differently for a provider that resets elsewhere', () => {
    expect(quotaPeriodKey(new Date('2026-08-26T05:00:00.000Z'), 'Europe/Istanbul')).toBe(
      '2026-08-26',
    );
  });
});

describe('secondsUntilQuotaReset', () => {
  it('counts down to the provider’s own midnight', () => {
    // 22:00 on the 25th in Los Angeles: two hours of the allowance's day are left.
    expect(
      secondsUntilQuotaReset(new Date('2026-08-26T05:00:00.000Z'), 'America/Los_Angeles'),
    ).toBe(2 * 60 * 60);
  });

  it('never reports zero, so a caller can always tell the guest when to come back', () => {
    expect(
      secondsUntilQuotaReset(new Date('2026-08-26T06:59:59.000Z'), 'America/Los_Angeles'),
    ).toBe(1);
  });

  it('survives the clocks changing, because the answer is an instant apart not a day', () => {
    // The day the US moves off daylight saving is 25 hours long where the allowance resets, and
    // a fixed 24-hour countdown would tell the guest to come back an hour before it did.
    expect(
      secondsUntilQuotaReset(new Date('2026-11-01T07:00:00.000Z'), 'America/Los_Angeles'),
    ).toBe(25 * 60 * 60);
  });
});
