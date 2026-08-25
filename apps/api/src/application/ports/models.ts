import type {
  BlockedRuleType,
  MusicProviderId,
  PaymentStatus,
  PlaybackState,
  QueueItemState,
  RequestStatus,
  RequestType,
  VenueUserRole,
} from '@moodisto/shared-types';

/**
 * Persistence-facing records. They are intentionally plain data: the use cases must not depend
 * on Prisma model types, so every adapter maps its rows onto these shapes.
 */

export interface VenueRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string | null;
  readonly logoUrl: string | null;
  readonly active: boolean;
  readonly timezone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly duplicateCooldownMinutes: number;
}

export interface NearbyVenueRecord extends VenueRecord {
  readonly distanceMeters: number;
}

export interface VenueQrCodeRecord {
  readonly id: string;
  readonly venueId: string;
  readonly token: string;
  readonly tableLabel: string | null;
  readonly active: boolean;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

export interface VenueUserRecord {
  readonly id: string;
  readonly venueId: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly role: VenueUserRole;
  readonly active: boolean;
}

export interface CustomerSessionRecord {
  readonly id: string;
  readonly sessionToken: string;
  readonly venueId: string | null;
  readonly tableLabel: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
}

export interface TrackRecord {
  readonly id: string;
  readonly provider: MusicProviderId;
  readonly providerTrackId: string;
  readonly title: string;
  readonly artist: string | null;
  readonly channelName: string | null;
  readonly channelId: string | null;
  readonly thumbnailUrl: string | null;
  readonly durationSeconds: number | null;
}

export interface TrackUpsertInput {
  readonly provider: MusicProviderId;
  readonly providerTrackId: string;
  readonly title: string;
  readonly artist: string | null;
  readonly channelName: string | null;
  readonly channelId: string | null;
  readonly thumbnailUrl: string | null;
  readonly durationSeconds: number | null;
}

export interface SongRequestRecord {
  readonly id: string;
  readonly venueId: string;
  readonly venueSlug: string;
  readonly customerSessionId: string | null;
  readonly trackId: string;
  readonly track: TrackRecord;
  readonly requestType: RequestType;
  readonly status: RequestStatus;
  readonly tableLabel: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly rejectionReason: string | null;
  readonly paymentStatus: PaymentStatus | null;
  readonly queuePosition: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateSongRequestInput {
  readonly venueId: string;
  readonly customerSessionId: string;
  readonly trackId: string;
  readonly requestType: RequestType;
  readonly status: RequestStatus;
  readonly tableLabel: string | null;
  readonly amountMinor: number;
  readonly currency: string;
}

export interface SongRequestStatusChange {
  readonly status: RequestStatus;
  readonly rejectionReason?: string | null;
  readonly acceptedAt?: Date;
  readonly rejectedAt?: Date;
  readonly queuedAt?: Date;
  readonly playingAt?: Date;
  readonly completedAt?: Date;
}

export interface QueueEntryRecord {
  readonly id: string;
  readonly venueId: string;
  readonly songRequestId: string;
  readonly position: number;
  readonly state: QueueItemState;
  readonly requestType: RequestType;
  readonly track: TrackRecord;
  readonly tableLabel: string | null;
  readonly startedAt: Date | null;
  readonly endedAt: Date | null;
  readonly createdAt: Date;
}

export interface QueuePositionAssignment {
  readonly id: string;
  readonly position: number;
}

export interface PlayerStateRecord {
  readonly venueId: string;
  readonly state: PlaybackState;
  readonly queueItemId: string | null;
  readonly version: number;
  readonly startedAt: Date | null;
  readonly updatedAt: Date;
}

export interface PlayerLeaseRecord {
  readonly venueId: string;
  readonly sessionId: string;
  readonly lastHeartbeatAt: Date;
  readonly createdAt: Date;
}

export interface PaymentRecord {
  readonly id: string;
  readonly songRequestId: string;
  readonly provider: string;
  readonly providerPaymentId: string | null;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly checkoutUrl: string | null;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
}

export interface CreatePaymentInput {
  readonly songRequestId: string;
  readonly provider: string;
  readonly providerPaymentId: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly checkoutUrl: string | null;
}

export interface BlockedRuleRecord {
  readonly id: string;
  readonly venueId: string;
  readonly type: BlockedRuleType;
  readonly value: string;
  readonly createdAt: Date;
}

export interface VenuePricingRecord {
  readonly venueId: string;
  readonly currency: string;
  readonly normalEnabled: boolean;
  readonly normalPriceMinor: number;
  readonly priorityEnabled: boolean;
  readonly priorityPriceMinor: number;
  readonly djEnabled: boolean;
  readonly djPriceMinor: number;
  readonly playNextEnabled: boolean;
  readonly playNextPriceMinor: number;
}

export interface VenuePricingUpdate {
  readonly currency?: string;
  readonly options: readonly {
    readonly type: RequestType;
    readonly enabled: boolean;
    readonly priceMinor: number;
  }[];
  readonly duplicateCooldownMinutes?: number;
}

export interface VenueSettingsUpdate {
  readonly name?: string;
  readonly description?: string | null;
  readonly address?: string | null;
  readonly logoUrl?: string | null;
  readonly active?: boolean;
  readonly timezone?: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly duplicateCooldownMinutes?: number;
}

export interface VenueStatsAggregate {
  readonly totalRequests: number;
  readonly acceptedRequests: number;
  readonly rejectedRequests: number;
  readonly paidRequests: number;
  readonly totalRevenueMinor: number;
  readonly averageWaitSeconds: number | null;
  readonly requestsByHour: readonly { readonly hour: number; readonly count: number }[];
}

export interface TopRequestRecord {
  readonly track: TrackRecord;
  readonly requestCount: number;
}

export interface AdminRequestFilter {
  readonly venueId: string;
  readonly statuses?: readonly RequestStatus[];
  readonly requestType?: RequestType;
  /**
   * Drops requests that never reached the venue: checkout still open, or checkout failed before
   * anyone was asked to approve them.
   */
  readonly excludeUnannounced?: boolean;
  readonly take: number;
  readonly skip: number;
}
