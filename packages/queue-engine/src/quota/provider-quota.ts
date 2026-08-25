/**
 * What is left of a provider's daily allowance at a point in time.
 *
 * `reserveUnits` is held back from discretionary work so that turning a chosen track into a
 * request keeps working even after a busy evening of searching: a guest who has already picked
 * their song must never be told to come back tomorrow.
 */
export interface ProviderQuotaSnapshot {
  /** Units the provider grants per reset period. */
  readonly dailyUnits: number;
  /** Units already booked in this period. */
  readonly spentUnits: number;
  /** Units kept back for finishing what guests have already started. */
  readonly reserveUnits: number;
}

/** Units search may still spend. Never negative: the reserve being eaten into simply means zero. */
export function spendableUnits(snapshot: ProviderQuotaSnapshot): number {
  return Math.max(0, snapshot.dailyUnits - snapshot.spentUnits - snapshot.reserveUnits);
}

/**
 * How many whole provider searches are still affordable.
 *
 * Whole ones only: telling a guest they have "half a search" left would promise an answer the
 * allowance cannot pay for. A provider that charges nothing is unlimited by definition.
 */
export function affordableSearches(snapshot: ProviderQuotaSnapshot, searchUnits: number): number {
  if (searchUnits <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(spendableUnits(snapshot) / searchUnits);
}

/**
 * The calendar day a moment belongs to in the provider's own reset time zone, as `YYYY-MM-DD`.
 *
 * Providers reset their allowance at midnight somewhere specific — YouTube at midnight Pacific —
 * so grouping by UTC would hand out a second day of quota every evening and then run dry
 * mid-afternoon. `en-CA` is used purely because it formats as ISO.
 */
export function quotaPeriodKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Longest a provider's day can be, allowing for a clock change. */
const MAX_PERIOD_MILLIS = 48 * 60 * 60 * 1000;

/**
 * Seconds until the provider hands out a fresh allowance.
 *
 * Found by looking for the instant the period key changes rather than by adding 24 hours, so the
 * night the clocks change does not send guests back an hour early or late. Never zero: a caller
 * always has something to put in front of the guest.
 */
export function secondsUntilQuotaReset(at: Date, timeZone: string): number {
  const currentKey = quotaPeriodKey(at, timeZone);
  let sameDay = at.getTime();
  let nextDay = sameDay + MAX_PERIOD_MILLIS;

  // Narrowed to the millisecond, so the answer is the reset instant rather than a second past it.
  while (nextDay - sameDay > 1) {
    const middle = Math.floor((sameDay + nextDay) / 2);
    if (quotaPeriodKey(new Date(middle), timeZone) === currentKey) {
      sameDay = middle;
    } else {
      nextDay = middle;
    }
  }
  return Math.max(1, Math.ceil((nextDay - at.getTime()) / 1000));
}
