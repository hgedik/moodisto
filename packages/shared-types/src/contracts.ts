import type {
  BlockedRuleType,
  MusicProviderId,
  PaymentStatus,
  PlaybackState,
  QueueItemState,
  RequestStatus,
  RequestType,
  VenueUserRole,
} from './enums';

/** Money is always transported as an integer amount of the currency's minor unit (kuruş). */
export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface TrackDto {
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

export interface TrackSearchResultDto {
  readonly provider: MusicProviderId;
  readonly providerTrackId: string;
  readonly title: string;
  readonly artist: string | null;
  readonly channelName: string | null;
  readonly channelId: string | null;
  readonly thumbnailUrl: string | null;
  readonly durationSeconds: number | null;
}

/** Where a set of search results came from, which is also what it cost. */
export enum MusicSearchSource {
  /** Tracks Moodisto already knows about. Free, instant, and grows with every provider search. */
  CATALOGUE = 'catalogue',
  /** The external provider. Costs quota, so only ever on an explicit request. */
  PROVIDER = 'provider',
}

/**
 * Whether the expensive door is still open today.
 *
 * Sent with every catalogue answer so the search screen can offer — or withhold — the provider
 * search button without a second round trip, and explain itself when it withholds it.
 */
export interface ProviderSearchAvailabilityDto {
  readonly available: boolean;
  /** Whole provider searches still affordable today, or null when the provider charges nothing. */
  readonly remainingSearches: number | null;
  /** Seconds until the provider hands out a fresh allowance. */
  readonly resetsInSeconds: number;
}

export interface MusicSearchResponse {
  readonly provider: MusicProviderId;
  readonly query: string;
  readonly source: MusicSearchSource;
  /** Provider searches only: whether the answer came from the stored search cache. */
  readonly cached: boolean;
  readonly providerSearch: ProviderSearchAvailabilityDto;
  readonly results: readonly TrackSearchResultDto[];
}

export interface VenueSummaryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly address: string | null;
  readonly logoUrl: string | null;
  readonly active: boolean;
}

export interface NearbyVenueDto extends VenueSummaryDto {
  readonly distanceMeters: number;
}

export interface RequestTypeOptionDto {
  readonly type: RequestType;
  readonly enabled: boolean;
  readonly priceMinor: number;
  readonly currency: string;
}

export interface VenueDetailDto extends VenueSummaryDto {
  /** Editable in the console, so it has to be readable there too. */
  readonly description: string | null;
  readonly timezone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly requestOptions: readonly RequestTypeOptionDto[];
  readonly queueLength: number;
}

export interface NowPlayingDto {
  readonly state: PlaybackState;
  readonly track: TrackDto | null;
  readonly requestType: RequestType | null;
  readonly startedAt: string | null;
  readonly queueLength: number;
}

export interface QueueEntryDto {
  readonly id: string;
  readonly position: number;
  readonly state: QueueItemState;
  readonly requestType: RequestType;
  readonly track: TrackDto;
  readonly tableLabel: string | null;
  readonly requestId: string;
  readonly createdAt: string;
}

export interface SongRequestDto {
  readonly id: string;
  readonly venueId: string;
  readonly venueSlug: string;
  readonly status: RequestStatus;
  readonly requestType: RequestType;
  readonly track: TrackDto;
  readonly tableLabel: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly paymentStatus: PaymentStatus | null;
  readonly rejectionReason: string | null;
  readonly queuePosition: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSongRequestResponse {
  readonly request: SongRequestDto;
  /** Present only when the request requires payment before it reaches the venue. */
  readonly payment: PaymentSessionDto | null;
}

export interface PaymentSessionDto {
  readonly paymentId: string;
  readonly provider: string;
  readonly status: PaymentStatus;
  readonly checkoutUrl: string | null;
  readonly checkoutFormContent: string | null;
  readonly expiresAt: string | null;
}

export interface TopRequestDto {
  readonly track: TrackDto;
  readonly requestCount: number;
}

export interface JoinVenueResponse {
  readonly venue: VenueDetailDto;
  readonly tableLabel: string | null;
}

export interface QrCodeDto {
  readonly id: string;
  readonly token: string;
  readonly tableLabel: string | null;
  readonly active: boolean;
  /** Absolute link the printed code encodes, built from the venue-facing app url. */
  readonly joinUrl: string;
  readonly createdAt: string;
}

export interface AuthenticatedVenueUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: VenueUserRole;
  readonly venue: VenueSummaryDto;
}

export interface BlockedRuleDto {
  readonly id: string;
  readonly type: BlockedRuleType;
  readonly value: string;
  readonly createdAt: string;
}

export interface VenuePricingDto {
  readonly currency: string;
  readonly options: readonly RequestTypeOptionDto[];
  readonly duplicateCooldownMinutes: number;
}

export interface PlayerStateDto {
  readonly venueId: string;
  readonly state: PlaybackState;
  readonly version: number;
  readonly current: QueueEntryDto | null;
  readonly upcoming: readonly QueueEntryDto[];
  readonly startedAt: string | null;
  readonly leaseOwned: boolean;
}

export interface PlayerLeaseDto {
  readonly venueId: string;
  readonly sessionId: string;
  readonly heldByCaller: boolean;
  readonly lastHeartbeatAt: string;
  readonly staleAfterSeconds: number;
}

export interface VenueStatsDto {
  readonly period: { readonly from: string; readonly to: string };
  readonly totalRequests: number;
  readonly acceptedRequests: number;
  readonly rejectedRequests: number;
  readonly paidRequests: number;
  readonly totalRevenueMinor: number;
  readonly currency: string;
  readonly queueLength: number;
  readonly averageWaitSeconds: number | null;
  readonly topTracks: readonly TopRequestDto[];
  readonly busiestHour: number | null;
  readonly requestsByHour: readonly { readonly hour: number; readonly count: number }[];
}

/** The operator of the installation itself; it belongs to no venue. */
export interface AuthenticatedSystemUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** Which of the three places the effective value came from. */
export type SystemSettingSource = 'database' | 'environment' | 'default';

/**
 * One row of the system settings panel.
 *
 * A secret never travels here in plain text: the panel learns only that a value exists and what
 * its last few characters are, which is enough to tell two keys apart and nothing more.
 */
export interface SystemSettingDto {
  readonly key: string;
  readonly group: 'music' | 'payment' | 'features';
  readonly kind: 'string' | 'boolean' | 'enum';
  readonly secret: boolean;
  readonly source: SystemSettingSource;
  readonly value: string | boolean | null;
  readonly hasValue: boolean;
  readonly preview: string | null;
  readonly enumValues: readonly string[] | null;
  readonly updatedAt: string | null;
}

export interface SystemSettingsResponse {
  readonly settings: readonly SystemSettingDto[];
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface ApiErrorBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly code?: string;
}
