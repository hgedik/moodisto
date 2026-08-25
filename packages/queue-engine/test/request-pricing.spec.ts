import { describe, expect, it } from 'vitest';
import { RequestType } from '@moodisto/shared-types';
import {
  RequestTypeDisabledError,
  type VenuePricing,
  resolveRequestPrice,
} from '../src/pricing/request-pricing';

const pricing: VenuePricing = {
  currency: 'TRY',
  options: [
    { type: RequestType.NORMAL, enabled: true, priceMinor: 0 },
    { type: RequestType.PRIORITY, enabled: true, priceMinor: 2000 },
    { type: RequestType.DJ, enabled: false, priceMinor: 3000 },
    { type: RequestType.PLAY_NEXT, enabled: true, priceMinor: 5000 },
  ],
};

describe('resolveRequestPrice', () => {
  it('resolves a free request type as not requiring payment', () => {
    expect(resolveRequestPrice(pricing, RequestType.NORMAL)).toEqual({
      priceMinor: 0,
      currency: 'TRY',
      requiresPayment: false,
    });
  });

  it('resolves a paid request type as requiring payment', () => {
    expect(resolveRequestPrice(pricing, RequestType.PLAY_NEXT)).toEqual({
      priceMinor: 5000,
      currency: 'TRY',
      requiresPayment: true,
    });
  });

  it('refuses a request type the venue switched off', () => {
    expect(() => resolveRequestPrice(pricing, RequestType.DJ)).toThrow(RequestTypeDisabledError);
  });

  it('refuses a request type the venue never configured', () => {
    const partial: VenuePricing = { currency: 'TRY', options: [] };

    expect(() => resolveRequestPrice(partial, RequestType.NORMAL)).toThrow(
      RequestTypeDisabledError,
    );
  });

  it('treats paid requests as free when paid requests are disabled platform-wide', () => {
    expect(
      resolveRequestPrice(pricing, RequestType.PRIORITY, { paidRequestsEnabled: false }),
    ).toEqual({ priceMinor: 0, currency: 'TRY', requiresPayment: false });
  });
});
