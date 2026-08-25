import { type RequestType } from '@moodisto/shared-types';
import { RequestTypeDisabledError } from '../errors';

export { RequestTypeDisabledError };

export interface RequestTypeConfig {
  readonly type: RequestType;
  readonly enabled: boolean;
  /** Price in the minor unit of the currency (kuruş for TRY). Never a float. */
  readonly priceMinor: number;
}

export interface VenuePricing {
  readonly currency: string;
  readonly options: readonly RequestTypeConfig[];
}

export interface ResolvedPrice {
  readonly priceMinor: number;
  readonly currency: string;
  readonly requiresPayment: boolean;
}

export interface PricingContext {
  /** Platform-wide kill switch, see ENABLE_PAID_REQUESTS. */
  readonly paidRequestsEnabled: boolean;
}

const DEFAULT_CONTEXT: PricingContext = { paidRequestsEnabled: true };

/**
 * Resolves what a request type costs at a venue.
 *
 * When paid requests are switched off platform-wide the request type stays available but becomes
 * free, so that a licensing or provider decision never takes features away from the venue.
 */
export function resolveRequestPrice(
  pricing: VenuePricing,
  requestType: RequestType,
  context: PricingContext = DEFAULT_CONTEXT,
): ResolvedPrice {
  const option = pricing.options.find((candidate) => candidate.type === requestType);
  if (option === undefined || !option.enabled) {
    throw new RequestTypeDisabledError(requestType);
  }

  const priceMinor = context.paidRequestsEnabled ? option.priceMinor : 0;
  return {
    priceMinor,
    currency: pricing.currency,
    requiresPayment: priceMinor > 0,
  };
}

export function listAvailableRequestTypes(
  pricing: VenuePricing,
  context: PricingContext = DEFAULT_CONTEXT,
): RequestTypeConfig[] {
  return pricing.options
    .filter((option) => option.enabled)
    .map((option) => ({
      ...option,
      priceMinor: context.paidRequestsEnabled ? option.priceMinor : 0,
    }));
}
