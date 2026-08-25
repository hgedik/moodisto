import type {
  BlockedRuleType,
  MusicProviderId,
  PaymentStatus,
  PlaybackState,
  QueueItemState,
  RequestStatus,
} from '@moodisto/shared-types';
import type {
  AdminRequestFilter,
  BlockedRuleRecord,
  CreatePaymentInput,
  CreateSongRequestInput,
  CustomerSessionRecord,
  NearbyVenueRecord,
  PaymentRecord,
  PlayerLeaseRecord,
  PlayerStateRecord,
  QueueEntryRecord,
  QueuePositionAssignment,
  SongRequestRecord,
  SongRequestStatusChange,
  TopRequestRecord,
  TrackRecord,
  TrackUpsertInput,
  VenuePricingRecord,
  VenuePricingUpdate,
  VenueQrCodeRecord,
  VenueRecord,
  VenueSettingsUpdate,
  VenueStatsAggregate,
  VenueUserRecord,
} from './models';

export interface VenueRepository {
  findById(venueId: string): Promise<VenueRecord | null>;
  findBySlug(slug: string): Promise<VenueRecord | null>;
  findNearby(input: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    limit: number;
  }): Promise<readonly NearbyVenueRecord[]>;
  getPricing(venueId: string): Promise<VenuePricingRecord | null>;
  updatePricing(venueId: string, update: VenuePricingUpdate): Promise<VenuePricingRecord>;
  updateSettings(venueId: string, update: VenueSettingsUpdate): Promise<VenueRecord>;
  /**
   * Serialises every queue-mutating transaction for a venue. Callers must invoke this as the
   * first statement of the transaction so lock ordering is identical everywhere.
   */
  lockForUpdate(venueId: string): Promise<void>;
}

export interface VenueQrCodeRepository {
  findByToken(token: string): Promise<VenueQrCodeRecord | null>;
  listByVenue(venueId: string): Promise<readonly VenueQrCodeRecord[]>;
  create(input: {
    venueId: string;
    token: string;
    tableLabel: string | null;
    expiresAt: Date | null;
  }): Promise<VenueQrCodeRecord>;
  deactivate(venueId: string, qrCodeId: string): Promise<VenueQrCodeRecord | null>;
}

export interface VenueUserRepository {
  findByEmail(email: string): Promise<VenueUserRecord | null>;
  findById(userId: string): Promise<VenueUserRecord | null>;
}

export interface CustomerSessionRepository {
  findByToken(sessionToken: string): Promise<CustomerSessionRecord | null>;
  create(input: {
    sessionToken: string;
    venueId: string | null;
    tableLabel: string | null;
  }): Promise<CustomerSessionRecord>;
  attachToVenue(
    sessionId: string,
    venueId: string,
    tableLabel: string | null,
  ): Promise<CustomerSessionRecord>;
}

export interface TrackRepository {
  upsertMany(tracks: readonly TrackUpsertInput[]): Promise<readonly TrackRecord[]>;
  /**
   * Searches the tracks Moodisto already knows about.
   *
   * A row matches when it contains every token, so word order and unfinished words behave the way
   * a guest expects. Tracks the provider refused to play are never returned.
   */
  searchCatalogue(input: {
    tokens: readonly string[];
    limit: number;
  }): Promise<readonly TrackRecord[]>;
  /**
   * Records that the track reached a venue's speakers and played.
   *
   * Also clears any earlier block: a track that just played is playable, whatever an older
   * failure claimed about it.
   */
  markPlayedOk(trackId: string, at: Date): Promise<void>;
  /**
   * Records that the provider itself refused the track, taking it out of every venue's catalogue.
   *
   * Reserved for the provider's own verdict. A venue-side fault must never reach here, because one
   * café's broken connection would otherwise shrink the catalogue for all of them.
   */
  markPlaybackBlocked(trackId: string, at: Date): Promise<void>;
  findByProviderTrackId(
    provider: MusicProviderId,
    providerTrackId: string,
  ): Promise<TrackRecord | null>;
  findById(trackId: string): Promise<TrackRecord | null>;
}

export interface SongRequestRepository {
  create(input: CreateSongRequestInput): Promise<SongRequestRecord>;
  findById(requestId: string): Promise<SongRequestRecord | null>;
  applyStatusChange(requestId: string, change: SongRequestStatusChange): Promise<SongRequestRecord>;
  list(filter: AdminRequestFilter): Promise<{ items: readonly SongRequestRecord[]; total: number }>;
  listForCustomerSession(
    sessionId: string,
    venueId: string,
    take: number,
  ): Promise<readonly SongRequestRecord[]>;
  /** Track ids currently occupying the venue: pending, accepted, queued or playing. */
  findActiveTrackIds(venueId: string): Promise<readonly string[]>;
  findLastCompletedAt(venueId: string, trackId: string): Promise<Date | null>;
  expireStalePendingPayments(venueId: string, olderThan: Date): Promise<readonly string[]>;
}

export interface QueueRepository {
  listActive(venueId: string): Promise<readonly QueueEntryRecord[]>;
  findCurrent(venueId: string): Promise<QueueEntryRecord | null>;
  findById(queueItemId: string): Promise<QueueEntryRecord | null>;
  /**
   * Shifts the given items one position back. Implementations must avoid transient unique index
   * violations (the `(venueId, position)` partial index is enforced by the database).
   */
  shiftPositionsBy(ids: readonly string[], delta: number): Promise<void>;
  applyPositions(assignments: readonly QueuePositionAssignment[]): Promise<void>;
  insert(input: {
    venueId: string;
    songRequestId: string;
    position: number;
  }): Promise<QueueEntryRecord>;
  updateState(
    queueItemId: string,
    state: QueueItemState,
    timestamps?: { startedAt?: Date; endedAt?: Date },
  ): Promise<QueueEntryRecord>;
  /** Locks and returns the next queued item, skipping rows another transaction already holds. */
  claimNextQueued(venueId: string): Promise<QueueEntryRecord | null>;
  countQueued(venueId: string): Promise<number>;
  /**
   * How many items failed since the last one that actually played through, which is what tells a
   * broken single video apart from a venue whose whole catalogue refuses to play.
   */
  countFailuresSinceLastPlayback(venueId: string): Promise<number>;
}

export interface PlayerRepository {
  getState(venueId: string): Promise<PlayerStateRecord | null>;
  saveState(input: {
    venueId: string;
    state: PlaybackState;
    queueItemId: string | null;
    startedAt: Date | null;
  }): Promise<PlayerStateRecord>;
  getLease(venueId: string): Promise<PlayerLeaseRecord | null>;
  acquireLease(venueId: string, sessionId: string, now: Date): Promise<PlayerLeaseRecord>;
  heartbeat(venueId: string, sessionId: string, now: Date): Promise<PlayerLeaseRecord | null>;
  releaseLease(venueId: string, sessionId: string): Promise<void>;
}

export interface PaymentRepository {
  create(input: CreatePaymentInput): Promise<PaymentRecord>;
  findById(paymentId: string): Promise<PaymentRecord | null>;
  findByProviderPaymentId(
    provider: string,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null>;
  updateStatus(
    paymentId: string,
    status: PaymentStatus,
    input?: { providerPaymentId?: string; paidAt?: Date; rawPayload?: unknown },
  ): Promise<PaymentRecord>;
}

/**
 * The ledger of what has been spent of a provider's daily allowance.
 *
 * A stored ledger rather than a counter in memory, because the allowance belongs to the
 * deployment: an API restart must not forget the day's spend, and two instances must not each
 * believe they have a full day left.
 */
export interface ProviderQuotaRepository {
  /** Units already booked in the given period. Zero when nothing has been spent yet. */
  spentUnits(provider: MusicProviderId, periodKey: string): Promise<number>;
  /**
   * Books `units` against the period, but only while the total stays within `ceilingUnits`.
   *
   * Check and increment are one statement, so two searches arriving together can never both read
   * the same old total and overspend the allowance. Returns the new total, or null when there was
   * not enough left — which is a product outcome, not a failure.
   */
  tryConsume(input: {
    provider: MusicProviderId;
    periodKey: string;
    units: number;
    ceilingUnits: number;
  }): Promise<number | null>;
}

export interface BlockedRuleRepository {
  listByVenue(venueId: string): Promise<readonly BlockedRuleRecord[]>;
  create(input: {
    venueId: string;
    type: BlockedRuleType;
    value: string;
  }): Promise<BlockedRuleRecord>;
  remove(venueId: string, ruleId: string): Promise<boolean>;
}

export interface StatsRepository {
  aggregate(venueId: string, from: Date, to: Date, timezone: string): Promise<VenueStatsAggregate>;
  topRequests(input: {
    venueId: string;
    from: Date;
    to: Date;
    limit: number;
    statuses?: readonly RequestStatus[];
  }): Promise<readonly TopRequestRecord[]>;
}
