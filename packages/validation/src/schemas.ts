import {
  BlockedRuleType,
  MusicProviderId,
  RequestType,
  StatsPeriod,
  TopRequestsPeriod,
  VenueUserRole,
} from '@moodisto/shared-types';
import { z } from 'zod';
import {
  DEFAULT_NEARBY_RADIUS_METERS,
  MAX_BLOCKED_RULE_VALUE_LENGTH,
  MAX_NEARBY_RADIUS_METERS,
  MAX_REJECTION_REASON_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_RESULTS,
  MAX_TABLE_LABEL_LENGTH,
  MAX_VENUE_SLUG_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
} from './constants';

const enumValues = <T extends Record<string, string>>(source: T): [string, ...string[]] =>
  Object.values(source) as [string, ...string[]];

export const musicProviderIdSchema = z
  .enum(enumValues(MusicProviderId))
  .transform((value) => value as MusicProviderId);
export const requestTypeSchema = z
  .enum(enumValues(RequestType))
  .transform((value) => value as RequestType);
export const blockedRuleTypeSchema = z
  .enum(enumValues(BlockedRuleType))
  .transform((value) => value as BlockedRuleType);
export const venueUserRoleSchema = z
  .enum(enumValues(VenueUserRole))
  .transform((value) => value as VenueUserRole);

export const cuidSchema = z.string().min(1).max(64);
export const venueSlugSchema = z
  .string()
  .min(2)
  .max(MAX_VENUE_SLUG_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and hyphen separated');

export const qrTokenSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'QR token must be URL safe');

export const musicSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(MIN_SEARCH_QUERY_LENGTH, `Search needs at least ${MIN_SEARCH_QUERY_LENGTH} characters`)
    .max(MAX_SEARCH_QUERY_LENGTH),
  venueId: cuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_RESULTS).default(MAX_SEARCH_RESULTS),
});
export type MusicSearchQuery = z.infer<typeof musicSearchQuerySchema>;

export const createSongRequestSchema = z.object({
  provider: musicProviderIdSchema,
  providerTrackId: z.string().trim().min(1).max(128),
  requestType: requestTypeSchema,
  tableLabel: z.string().trim().min(1).max(MAX_TABLE_LABEL_LENGTH).nullish(),
});
export type CreateSongRequestInput = z.infer<typeof createSongRequestSchema>;

export const rejectSongRequestSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_REJECTION_REASON_LENGTH).nullish(),
});
export type RejectSongRequestInput = z.infer<typeof rejectSongRequestSchema>;

export const reorderQueueSchema = z.object({
  items: z.array(cuidSchema).min(0).max(500),
});
export type ReorderQueueInput = z.infer<typeof reorderQueueSchema>;

export const venueLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().min(8).max(200),
});
export type VenueLoginInput = z.infer<typeof venueLoginSchema>;

const requestTypePricingSchema = z.object({
  type: requestTypeSchema,
  enabled: z.boolean(),
  priceMinor: z.number().int().min(0).max(10_000_000),
});

export const updateVenuePricingSchema = z.object({
  currency: z.string().trim().length(3).toUpperCase(),
  duplicateCooldownMinutes: z.number().int().min(0).max(1440),
  options: z.array(requestTypePricingSchema).min(1).max(4),
});
export type UpdateVenuePricingInput = z.infer<typeof updateVenuePricingSchema>;

export const createBlockedRuleSchema = z.object({
  type: blockedRuleTypeSchema,
  value: z.string().trim().min(1).max(MAX_BLOCKED_RULE_VALUE_LENGTH),
});
export type CreateBlockedRuleInput = z.infer<typeof createBlockedRuleSchema>;

export const nearbyVenuesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce
    .number()
    .int()
    .min(100)
    .max(MAX_NEARBY_RADIUS_METERS)
    .default(DEFAULT_NEARBY_RADIUS_METERS),
});
export type NearbyVenuesQuery = z.infer<typeof nearbyVenuesQuerySchema>;

export const topRequestsQuerySchema = z.object({
  period: z
    .enum(enumValues(TopRequestsPeriod))
    .default(TopRequestsPeriod.TONIGHT)
    .transform((value) => value as TopRequestsPeriod),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type TopRequestsQuery = z.infer<typeof topRequestsQuerySchema>;

export const statsQuerySchema = z
  .object({
    period: z
      .enum(enumValues(StatsPeriod))
      .default(StatsPeriod.TODAY)
      .transform((value) => value as StatsPeriod),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine(
    (value) =>
      value.period !== StatsPeriod.CUSTOM || (value.from !== undefined && value.to !== undefined),
    { message: 'A custom period needs both from and to' },
  )
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    message: 'from must not be after to',
  });
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const adminRequestsQuerySchema = z.object({
  status: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminRequestsQuery = z.infer<typeof adminRequestsQuerySchema>;

export const playerSessionSchema = z.object({
  sessionId: z.string().trim().min(8).max(64),
});
export type PlayerSessionInput = z.infer<typeof playerSessionSchema>;

export const playerStartSchema = playerSessionSchema.extend({
  takeover: z.boolean().default(false),
});
export type PlayerStartInput = z.infer<typeof playerStartSchema>;

export const playerCompleteSchema = playerSessionSchema.extend({
  queueItemId: cuidSchema,
});
export type PlayerCompleteInput = z.infer<typeof playerCompleteSchema>;

export const playerErrorSchema = playerSessionSchema.extend({
  queueItemId: cuidSchema,
  code: z.string().trim().max(64).nullish(),
  message: z.string().trim().max(500).nullish(),
});
export type PlayerErrorInput = z.infer<typeof playerErrorSchema>;

export const createPaymentSchema = z.object({
  requestId: cuidSchema,
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const createQrCodeSchema = z.object({
  tableLabel: z.string().trim().min(1).max(MAX_TABLE_LABEL_LENGTH).nullish(),
});
export type CreateQrCodeInput = z.infer<typeof createQrCodeSchema>;

/** Shared by the operator console's create and edit forms, so a venue describes itself the same way at every age. */
const venueProfileShape = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  address: z.string().trim().max(300).nullish(),
  timezone: z.string().trim().min(3).max(64),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  logoUrl: z.string().trim().url().max(500).nullish(),
};

export const updateVenueSettingsSchema = z.object({
  ...venueProfileShape,
  active: z.boolean(),
});
export type UpdateVenueSettingsInput = z.infer<typeof updateVenueSettingsSchema>;

const accountEmailSchema = z.string().trim().toLowerCase().email().max(180);
const accountNameSchema = z.string().trim().min(2).max(120);

/**
 * Everything an operator states when a café joins Moodisto. The slug is only settable here: once
 * QR codes are printed, the address a guest scans has to keep working.
 */
export const createVenueSchema = z.object({
  ...venueProfileShape,
  timezone: venueProfileShape.timezone.default('Europe/Istanbul'),
  slug: venueSlugSchema,
  owner: z.object({ name: accountNameSchema, email: accountEmailSchema }),
  firstTableLabel: z.string().trim().min(1).max(MAX_TABLE_LABEL_LENGTH).nullish(),
});
export type CreateVenueInput = z.infer<typeof createVenueSchema>;

/** No password field: the system generates the first one and shows it exactly once. */
export const createVenueUserSchema = z.object({
  email: accountEmailSchema,
  name: accountNameSchema,
  role: venueUserRoleSchema,
});
export type CreateVenueUserInput = z.infer<typeof createVenueUserSchema>;

export const updateVenueUserSchema = z.object({
  name: accountNameSchema,
  role: venueUserRoleSchema,
  active: z.boolean(),
});
export type UpdateVenueUserInput = z.infer<typeof updateVenueUserSchema>;

export const createSystemUserSchema = z.object({
  email: accountEmailSchema,
  name: accountNameSchema,
});
export type CreateSystemUserInput = z.infer<typeof createSystemUserSchema>;

export const updateSystemUserSchema = z.object({
  name: accountNameSchema,
  active: z.boolean(),
});
export type UpdateSystemUserInput = z.infer<typeof updateSystemUserSchema>;
