import { describe, expect, it } from 'vitest';
import { RequestType, StatsPeriod, TopRequestsPeriod } from '@moodisto/shared-types';
import {
  createBlockedRuleSchema,
  createSongRequestSchema,
  musicSearchQuerySchema,
  nearbyVenuesQuerySchema,
  qrTokenSchema,
  reorderQueueSchema,
  statsQuerySchema,
  topRequestsQuerySchema,
  updateVenuePricingSchema,
  venueLoginSchema,
  venueSlugSchema,
} from '../src/schemas';
import { MAX_SEARCH_RESULTS, MIN_SEARCH_QUERY_LENGTH } from '../src/constants';

describe('musicSearchQuerySchema', () => {
  it('rejects a query shorter than the quota-protecting minimum', () => {
    expect(musicSearchQuerySchema.safeParse({ q: 'ta' }).success).toBe(false);
  });

  it('accepts a query at the minimum length and defaults the result limit', () => {
    const parsed = musicSearchQuerySchema.parse({ q: 'tar' });

    expect(parsed.q.length).toBeGreaterThanOrEqual(MIN_SEARCH_QUERY_LENGTH);
    expect(parsed.limit).toBe(MAX_SEARCH_RESULTS);
  });

  it('caps the result limit', () => {
    expect(musicSearchQuerySchema.safeParse({ q: 'tarkan', limit: 50 }).success).toBe(false);
  });

  it('trims surrounding whitespace before applying the minimum length', () => {
    expect(musicSearchQuerySchema.safeParse({ q: '  a  ' }).success).toBe(false);
  });
});

describe('createSongRequestSchema', () => {
  it('accepts a provider qualified request', () => {
    const parsed = createSongRequestSchema.parse({
      provider: 'YOUTUBE',
      providerTrackId: 'abc123',
      requestType: RequestType.PRIORITY,
      tableLabel: 'Masa 8',
    });

    expect(parsed.requestType).toBe(RequestType.PRIORITY);
  });

  it('rejects an unknown provider', () => {
    const result = createSongRequestSchema.safeParse({
      provider: 'SPOTIFY',
      providerTrackId: 'abc123',
      requestType: RequestType.NORMAL,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown request type', () => {
    const result = createSongRequestSchema.safeParse({
      provider: 'YOUTUBE',
      providerTrackId: 'abc123',
      requestType: 'SUPER_PRIORITY',
    });

    expect(result.success).toBe(false);
  });
});

describe('venueSlugSchema', () => {
  it.each(['cafe-moda', 'moda2', 'a-b-c'])('accepts %s', (slug) => {
    expect(venueSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(['Cafe Moda', '-moda', 'moda-', 'ça'])('rejects %s', (slug) => {
    expect(venueSlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe('qrTokenSchema', () => {
  it('accepts a url safe token', () => {
    expect(qrTokenSchema.safeParse('7fP2M8LqXc_ab-1234567').success).toBe(true);
  });

  it('rejects a short token so that brute force stays impractical', () => {
    expect(qrTokenSchema.safeParse('short').success).toBe(false);
  });

  it('rejects a token with unsafe characters', () => {
    expect(qrTokenSchema.safeParse('7fP2M8LqXc/ab+1234567').success).toBe(false);
  });
});

describe('venueLoginSchema', () => {
  it('lowercases the email', () => {
    expect(
      venueLoginSchema.parse({ email: 'Admin@Example.com', password: 'supersecret' }).email,
    ).toBe('admin@example.com');
  });

  it('rejects a short password', () => {
    expect(venueLoginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });
});

describe('updateVenuePricingSchema', () => {
  it('rejects fractional prices so money stays in minor units', () => {
    const result = updateVenuePricingSchema.safeParse({
      currency: 'TRY',
      duplicateCooldownMinutes: 30,
      options: [{ type: RequestType.PRIORITY, enabled: true, priceMinor: 20.5 }],
    });

    expect(result.success).toBe(false);
  });

  it('uppercases the currency', () => {
    const parsed = updateVenuePricingSchema.parse({
      currency: 'try',
      duplicateCooldownMinutes: 30,
      options: [{ type: RequestType.NORMAL, enabled: true, priceMinor: 0 }],
    });

    expect(parsed.currency).toBe('TRY');
  });
});

describe('createBlockedRuleSchema', () => {
  it('accepts a keyword rule', () => {
    expect(createBlockedRuleSchema.parse({ type: 'KEYWORD', value: ' remix ' }).value).toBe(
      'remix',
    );
  });

  it('rejects an unknown rule type', () => {
    expect(createBlockedRuleSchema.safeParse({ type: 'ARTIST', value: 'x' }).success).toBe(false);
  });
});

describe('reorderQueueSchema', () => {
  it('accepts an empty ordering', () => {
    expect(reorderQueueSchema.parse({ items: [] }).items).toEqual([]);
  });
});

describe('nearbyVenuesQuerySchema', () => {
  it('coerces query string coordinates and defaults the radius', () => {
    const parsed = nearbyVenuesQuerySchema.parse({ lat: '40.98', lng: '29.02' });

    expect(parsed.lat).toBeCloseTo(40.98);
    expect(parsed.radiusMeters).toBeGreaterThan(0);
  });

  it('rejects an out of range latitude', () => {
    expect(nearbyVenuesQuerySchema.safeParse({ lat: '120', lng: '29' }).success).toBe(false);
  });
});

describe('topRequestsQuerySchema', () => {
  it('defaults to tonight', () => {
    expect(topRequestsQuerySchema.parse({}).period).toBe(TopRequestsPeriod.TONIGHT);
  });
});

describe('statsQuerySchema', () => {
  it('defaults to today', () => {
    expect(statsQuerySchema.parse({}).period).toBe(StatsPeriod.TODAY);
  });

  it('requires a range for a custom period', () => {
    expect(statsQuerySchema.safeParse({ period: 'custom' }).success).toBe(false);
  });

  it('rejects an inverted range', () => {
    const result = statsQuerySchema.safeParse({
      period: 'custom',
      from: '2026-08-25',
      to: '2026-08-24',
    });

    expect(result.success).toBe(false);
  });
});
