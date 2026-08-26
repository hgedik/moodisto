import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MusicProvider } from '@moodisto/music-provider';
import {
  affordableSearches,
  quotaPeriodKey,
  secondsUntilQuotaReset,
  type ProviderQuotaSnapshot,
} from '@moodisto/queue-engine';
import type { ProviderSearchAvailabilityDto } from '@moodisto/shared-types';
import { PROVIDER_QUOTA_REQUEST_RESERVE_UNITS } from '@moodisto/validation';
import { CLOCK, DATABASE, type Clock, type Database } from '../application/ports';
import { TooManyRequestsError } from '../common/errors';
import { MUSIC_PROVIDER } from './music-provider.factory';

/**
 * Guards the one thing in Moodisto that cannot simply be scaled up: the provider's daily
 * allowance.
 *
 * The provider declares what it charges, this service decides who gets to spend it. Search spends
 * only what is left above the request reserve, so a guest who has already picked a song can always
 * finish sending it — even on an evening that used up every search.
 */
@Injectable()
export class ProviderQuotaService {
  private readonly logger = new Logger(ProviderQuotaService.name);

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MUSIC_PROVIDER) private readonly provider: MusicProvider,
  ) {}

  /** What the search screen needs to decide whether to offer a provider search at all. */
  async availability(): Promise<ProviderSearchAvailabilityDto> {
    const { quota } = this.provider;
    const now = this.clock.now();
    const snapshot = await this.snapshot(now);
    const searches = affordableSearches(snapshot, quota.searchUnits);

    return {
      available: searches > 0,
      remainingSearches: Number.isFinite(searches) ? searches : null,
      resetsInSeconds: secondsUntilQuotaReset(now, quota.resetTimeZone),
    };
  }

  /**
   * Books one provider search, or refuses when only the request reserve is left.
   *
   * Refusing is a product decision, not an error: the caller falls back to the local catalogue and
   * tells the guest when the provider can be asked again.
   */
  async consumeSearch(): Promise<void> {
    const { quota } = this.provider;
    const now = this.clock.now();
    const ceiling = Math.max(0, quota.dailyUnits - PROVIDER_QUOTA_REQUEST_RESERVE_UNITS);

    if (!(await this.consume(quota.searchUnits, ceiling, now))) {
      this.logger.warn(
        `${this.provider.id} arama kotası tükendi; yalnızca yerel katalog yanıt veriyor.`,
      );
      throw new TooManyRequestsError(
        'Bugünün müzik arama kotası doldu. Yerel katalogdan aramaya devam edebilirsin.',
        secondsUntilQuotaReset(now, quota.resetTimeZone),
        'PROVIDER_QUOTA_EXHAUSTED',
      );
    }
  }

  /**
   * Books the lookup a first-time track needs to become a request.
   *
   * Allowed all the way to the daily allowance, reserve included: this is what the reserve was
   * being kept for.
   */
  async consumeTrackLookup(): Promise<void> {
    const { quota } = this.provider;
    const now = this.clock.now();

    if (!(await this.consume(quota.trackLookupUnits, quota.dailyUnits, now))) {
      throw new TooManyRequestsError(
        'Bugünün müzik sağlayıcı kotası doldu, lütfen daha sonra tekrar dene.',
        secondsUntilQuotaReset(now, quota.resetTimeZone),
        'PROVIDER_QUOTA_EXHAUSTED',
      );
    }
  }

  private async consume(units: number, ceilingUnits: number, now: Date): Promise<boolean> {
    if (units <= 0) {
      return true;
    }
    const booked = await this.database.read().providerQuota.tryConsume({
      provider: this.provider.id,
      periodKey: quotaPeriodKey(now, this.provider.quota.resetTimeZone),
      units,
      ceilingUnits,
    });
    return booked !== null;
  }

  private async snapshot(now: Date): Promise<ProviderQuotaSnapshot> {
    const { quota } = this.provider;
    const spentUnits = await this.database
      .read()
      .providerQuota.spentUnits(this.provider.id, quotaPeriodKey(now, quota.resetTimeZone));

    return {
      dailyUnits: quota.dailyUnits,
      spentUnits,
      reserveUnits: PROVIDER_QUOTA_REQUEST_RESERVE_UNITS,
    };
  }
}
