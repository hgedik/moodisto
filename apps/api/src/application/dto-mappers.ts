import { REQUEST_TYPES, RequestType } from '@moodisto/shared-types';
import type {
  BlockedRuleDto,
  NearbyVenueDto,
  PlayerStateDto,
  QueueEntryDto,
  RequestTypeOptionDto,
  SongRequestDto,
  SystemUserDto,
  SystemVenueDto,
  TopRequestDto,
  TrackDto,
  VenueDetailDto,
  VenuePricingDto,
  VenueSummaryDto,
  VenueUserDto,
} from '@moodisto/shared-types';
import type { VenuePricing } from '@moodisto/queue-engine';
import type {
  BlockedRuleRecord,
  NearbyVenueRecord,
  PlayerStateRecord,
  QueueEntryRecord,
  SongRequestRecord,
  SystemUserRecord,
  TopRequestRecord,
  TrackRecord,
  VenueListRecord,
  VenuePricingRecord,
  VenueRecord,
  VenueUserRecord,
} from './ports';

const PRICING_ACCESSORS = {
  [RequestType.NORMAL]: { enabled: 'normalEnabled', price: 'normalPriceMinor' },
  [RequestType.PRIORITY]: { enabled: 'priorityEnabled', price: 'priorityPriceMinor' },
  [RequestType.DJ]: { enabled: 'djEnabled', price: 'djPriceMinor' },
  [RequestType.PLAY_NEXT]: { enabled: 'playNextEnabled', price: 'playNextPriceMinor' },
} as const satisfies Record<
  RequestType,
  { enabled: keyof VenuePricingRecord; price: keyof VenuePricingRecord }
>;

export const toTrackDto = (record: TrackRecord): TrackDto => ({
  id: record.id,
  provider: record.provider,
  providerTrackId: record.providerTrackId,
  title: record.title,
  artist: record.artist,
  channelName: record.channelName,
  channelId: record.channelId,
  thumbnailUrl: record.thumbnailUrl,
  durationSeconds: record.durationSeconds,
});

export const toRequestTypeOptions = (
  pricing: VenuePricingRecord,
): readonly RequestTypeOptionDto[] =>
  REQUEST_TYPES.map((type) => {
    const accessor = PRICING_ACCESSORS[type];
    return {
      type,
      enabled: pricing[accessor.enabled] as boolean,
      priceMinor: pricing[accessor.price] as number,
      currency: pricing.currency,
    };
  });

/** Bridges the persistence row onto the domain's provider-agnostic pricing model. */
export const toDomainPricing = (pricing: VenuePricingRecord): VenuePricing => ({
  currency: pricing.currency,
  options: REQUEST_TYPES.map((type) => {
    const accessor = PRICING_ACCESSORS[type];
    return {
      type,
      enabled: pricing[accessor.enabled] as boolean,
      priceMinor: pricing[accessor.price] as number,
    };
  }),
});

export const toVenueSummaryDto = (venue: VenueRecord): VenueSummaryDto => ({
  id: venue.id,
  slug: venue.slug,
  name: venue.name,
  address: venue.address,
  logoUrl: venue.logoUrl,
  active: venue.active,
});

export const toVenueDetailDto = (
  venue: VenueRecord,
  pricing: VenuePricingRecord,
  queueLength: number,
): VenueDetailDto => ({
  ...toVenueSummaryDto(venue),
  description: venue.description,
  timezone: venue.timezone,
  latitude: venue.latitude,
  longitude: venue.longitude,
  requestOptions: toRequestTypeOptions(pricing),
  queueLength,
});

export const toNearbyVenueDto = (venue: NearbyVenueRecord): NearbyVenueDto => ({
  ...toVenueSummaryDto(venue),
  distanceMeters: venue.distanceMeters,
});

export const toVenuePricingDto = (
  pricing: VenuePricingRecord,
  duplicateCooldownMinutes: number,
): VenuePricingDto => ({
  currency: pricing.currency,
  options: toRequestTypeOptions(pricing),
  duplicateCooldownMinutes,
});

export const toQueueEntryDto = (entry: QueueEntryRecord): QueueEntryDto => ({
  id: entry.id,
  position: entry.position,
  state: entry.state,
  requestType: entry.requestType,
  track: toTrackDto(entry.track),
  tableLabel: entry.tableLabel,
  requestId: entry.songRequestId,
  createdAt: entry.createdAt.toISOString(),
});

export const toSongRequestDto = (request: SongRequestRecord): SongRequestDto => ({
  id: request.id,
  venueId: request.venueId,
  venueSlug: request.venueSlug,
  status: request.status,
  requestType: request.requestType,
  track: toTrackDto(request.track),
  tableLabel: request.tableLabel,
  amountMinor: request.amountMinor,
  currency: request.currency,
  paymentStatus: request.paymentStatus,
  rejectionReason: request.rejectionReason,
  queuePosition: request.queuePosition,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
});

export const toTopRequestDto = (record: TopRequestRecord): TopRequestDto => ({
  track: toTrackDto(record.track),
  requestCount: record.requestCount,
});

export const toBlockedRuleDto = (record: BlockedRuleRecord): BlockedRuleDto => ({
  id: record.id,
  type: record.type,
  value: record.value,
  createdAt: record.createdAt.toISOString(),
});

export const toPlayerStateDto = (input: {
  state: PlayerStateRecord;
  current: QueueEntryRecord | null;
  upcoming: readonly QueueEntryRecord[];
  leaseOwned: boolean;
  providerPlaybackEnabled: boolean;
}): PlayerStateDto => ({
  venueId: input.state.venueId,
  state: input.state.state,
  version: input.state.version,
  current: input.current ? toQueueEntryDto(input.current) : null,
  upcoming: input.upcoming.map(toQueueEntryDto),
  startedAt: input.state.startedAt?.toISOString() ?? null,
  leaseOwned: input.leaseOwned,
  providerPlaybackEnabled: input.providerPlaybackEnabled,
});

export const toSystemVenueDto = (venue: VenueListRecord): SystemVenueDto => ({
  ...toVenueSummaryDto(venue),
  description: venue.description,
  timezone: venue.timezone,
  userCount: venue.userCount,
});

/** The password hash stays behind: the console never has a reason to see it. */
export const toVenueUserDto = (user: VenueUserRecord): VenueUserDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  active: user.active,
});

export const toSystemUserDto = (user: SystemUserRecord): SystemUserDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  active: user.active,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
});
