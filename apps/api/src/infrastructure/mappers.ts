import type {
  Prisma,
  SystemSetting,
  SystemUser,
  Track,
  Venue,
  VenueQrCode,
  VenueUser,
} from '@moodisto/database';
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
import type {
  BlockedRuleRecord,
  CustomerSessionRecord,
  PaymentRecord,
  PlayerLeaseRecord,
  PlayerStateRecord,
  QueueEntryRecord,
  SongRequestRecord,
  SystemSettingRecord,
  SystemUserRecord,
  TrackRecord,
  VenuePricingRecord,
  VenueQrCodeRecord,
  VenueRecord,
  VenueUserRecord,
} from '../application/ports';

export const toVenueRecord = (row: Venue): VenueRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  address: row.address,
  logoUrl: row.logoUrl,
  active: row.active,
  timezone: row.timezone,
  latitude: row.latitude,
  longitude: row.longitude,
  duplicateCooldownMinutes: row.duplicateCooldownMinutes,
});

export const toTrackRecord = (row: Track): TrackRecord => ({
  id: row.id,
  provider: row.provider as MusicProviderId,
  providerTrackId: row.providerTrackId,
  title: row.title,
  artist: row.artist,
  channelName: row.channelName,
  channelId: row.channelId,
  thumbnailUrl: row.thumbnailUrl,
  durationSeconds: row.durationSeconds,
});

export const toVenueUserRecord = (row: VenueUser): VenueUserRecord => ({
  id: row.id,
  venueId: row.venueId,
  email: row.email,
  name: row.name,
  passwordHash: row.passwordHash,
  role: row.role as VenueUserRole,
  active: row.active,
});

export const toQrCodeRecord = (row: VenueQrCode): VenueQrCodeRecord => ({
  id: row.id,
  venueId: row.venueId,
  token: row.token,
  tableLabel: row.tableLabel,
  active: row.active,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

export const toCustomerSessionRecord = (row: {
  id: string;
  sessionToken: string;
  venueId: string | null;
  tableLabel: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}): CustomerSessionRecord => ({
  id: row.id,
  sessionToken: row.sessionToken,
  venueId: row.venueId,
  tableLabel: row.tableLabel,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
});

export const songRequestInclude = {
  track: true,
  venue: { select: { slug: true } },
  payment: { select: { status: true } },
  queueItem: { select: { position: true, state: true } },
} satisfies Prisma.SongRequestInclude;

type SongRequestRow = Prisma.SongRequestGetPayload<{ include: typeof songRequestInclude }>;

export const toSongRequestRecord = (row: SongRequestRow): SongRequestRecord => ({
  id: row.id,
  venueId: row.venueId,
  venueSlug: row.venue.slug,
  customerSessionId: row.customerSessionId,
  trackId: row.trackId,
  track: toTrackRecord(row.track),
  requestType: row.requestType as RequestType,
  status: row.status as RequestStatus,
  tableLabel: row.tableLabel,
  amountMinor: row.amountMinor,
  currency: row.currency,
  rejectionReason: row.rejectionReason,
  paymentStatus: (row.payment?.status as PaymentStatus | undefined) ?? null,
  queuePosition:
    row.queueItem && (row.queueItem.state === 'QUEUED' || row.queueItem.state === 'PLAYING')
      ? row.queueItem.position
      : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const queueItemInclude = {
  songRequest: { include: { track: true } },
} satisfies Prisma.QueueItemInclude;

type QueueItemRow = Prisma.QueueItemGetPayload<{ include: typeof queueItemInclude }>;

export const toQueueEntryRecord = (row: QueueItemRow): QueueEntryRecord => ({
  id: row.id,
  venueId: row.venueId,
  songRequestId: row.songRequestId,
  position: row.position,
  state: row.state as QueueItemState,
  requestType: row.songRequest.requestType as RequestType,
  track: toTrackRecord(row.songRequest.track),
  tableLabel: row.songRequest.tableLabel,
  startedAt: row.startedAt,
  endedAt: row.completedAt,
  createdAt: row.createdAt,
});

export const toPlayerStateRecord = (row: {
  venueId: string;
  state: string;
  queueItemId: string | null;
  version: number;
  startedAt: Date | null;
  updatedAt: Date;
}): PlayerStateRecord => ({
  venueId: row.venueId,
  state: row.state as PlaybackState,
  queueItemId: row.queueItemId,
  version: row.version,
  startedAt: row.startedAt,
  updatedAt: row.updatedAt,
});

export const toPlayerLeaseRecord = (row: {
  venueId: string;
  sessionId: string;
  lastHeartbeatAt: Date;
  createdAt: Date;
}): PlayerLeaseRecord => ({
  venueId: row.venueId,
  sessionId: row.sessionId,
  lastHeartbeatAt: row.lastHeartbeatAt,
  createdAt: row.createdAt,
});

/** The PSP checkout URL lives in `metadata` so adding a provider never needs a migration. */
export const readCheckoutUrl = (metadata: Prisma.JsonValue): string | null => {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)['checkoutUrl'];
    return typeof value === 'string' ? value : null;
  }
  return null;
};

export const toPaymentRecord = (row: {
  id: string;
  songRequestId: string;
  provider: string;
  providerPaymentId: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  paidAt: Date | null;
}): PaymentRecord => ({
  id: row.id,
  songRequestId: row.songRequestId,
  provider: row.provider,
  providerPaymentId: row.providerPaymentId,
  status: row.status as PaymentStatus,
  amountMinor: row.amountMinor,
  currency: row.currency,
  checkoutUrl: readCheckoutUrl(row.metadata),
  createdAt: row.createdAt,
  paidAt: row.paidAt,
});

export const toBlockedRuleRecord = (row: {
  id: string;
  venueId: string;
  type: string;
  value: string;
  createdAt: Date;
}): BlockedRuleRecord => ({
  id: row.id,
  venueId: row.venueId,
  type: row.type as BlockedRuleType,
  value: row.value,
  createdAt: row.createdAt,
});

export const toVenuePricingRecord = (row: {
  venueId: string;
  currency: string;
  normalEnabled: boolean;
  normalPriceMinor: number;
  priorityEnabled: boolean;
  priorityPriceMinor: number;
  djEnabled: boolean;
  djPriceMinor: number;
  playNextEnabled: boolean;
  playNextPriceMinor: number;
}): VenuePricingRecord => ({
  venueId: row.venueId,
  currency: row.currency,
  normalEnabled: row.normalEnabled,
  normalPriceMinor: row.normalPriceMinor,
  priorityEnabled: row.priorityEnabled,
  priorityPriceMinor: row.priorityPriceMinor,
  djEnabled: row.djEnabled,
  djPriceMinor: row.djPriceMinor,
  playNextEnabled: row.playNextEnabled,
  playNextPriceMinor: row.playNextPriceMinor,
});

export const toSystemUserRecord = (row: SystemUser): SystemUserRecord => ({
  id: row.id,
  email: row.email,
  name: row.name,
  passwordHash: row.passwordHash,
  active: row.active,
  lastLoginAt: row.lastLoginAt,
  createdAt: row.createdAt,
});

export const toSystemSettingRecord = (row: SystemSetting): SystemSettingRecord => ({
  key: row.key,
  valueText: row.valueText,
  valueCipher: row.valueCipher,
  secret: row.secret,
  updatedById: row.updatedById,
  updatedAt: row.updatedAt,
});
