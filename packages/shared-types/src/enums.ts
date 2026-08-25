/**
 * Domain enumerations shared by every layer of Moodisto.
 *
 * These are declared as const objects (not TypeScript `enum`s) so that they can be consumed by
 * the browser bundle, the API and the Prisma layer without runtime coupling between them.
 * `packages/database` asserts that the Prisma schema mirrors these values exactly.
 */

export const MusicProviderId = {
  YOUTUBE: 'YOUTUBE',
} as const;
export type MusicProviderId = (typeof MusicProviderId)[keyof typeof MusicProviderId];

export const RequestType = {
  NORMAL: 'NORMAL',
  PRIORITY: 'PRIORITY',
  DJ: 'DJ',
  PLAY_NEXT: 'PLAY_NEXT',
} as const;
export type RequestType = (typeof RequestType)[keyof typeof RequestType];

export const REQUEST_TYPES: readonly RequestType[] = Object.freeze([
  RequestType.NORMAL,
  RequestType.PRIORITY,
  RequestType.DJ,
  RequestType.PLAY_NEXT,
]);

export const RequestStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  QUEUED: 'QUEUED',
  PLAYING: 'PLAYING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const QueueItemState = {
  QUEUED: 'QUEUED',
  PLAYING: 'PLAYING',
  COMPLETED: 'COMPLETED',
  REMOVED: 'REMOVED',
  FAILED: 'FAILED',
} as const;
export type QueueItemState = (typeof QueueItemState)[keyof typeof QueueItemState];

export const PlaybackState = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  ERROR: 'ERROR',
} as const;
export type PlaybackState = (typeof PlaybackState)[keyof typeof PlaybackState];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const BlockedRuleType = {
  TRACK: 'TRACK',
  CHANNEL: 'CHANNEL',
  KEYWORD: 'KEYWORD',
} as const;
export type BlockedRuleType = (typeof BlockedRuleType)[keyof typeof BlockedRuleType];

export const VenueUserRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  DJ: 'DJ',
} as const;
export type VenueUserRole = (typeof VenueUserRole)[keyof typeof VenueUserRole];

export const StatsPeriod = {
  TODAY: 'today',
  LAST_7_DAYS: '7days',
  LAST_30_DAYS: '30days',
  CUSTOM: 'custom',
} as const;
export type StatsPeriod = (typeof StatsPeriod)[keyof typeof StatsPeriod];

export const TopRequestsPeriod = {
  TONIGHT: 'tonight',
  TODAY: 'today',
  WEEK: 'week',
} as const;
export type TopRequestsPeriod = (typeof TopRequestsPeriod)[keyof typeof TopRequestsPeriod];
