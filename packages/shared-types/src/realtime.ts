import type {
  NowPlayingDto,
  PlayerStateDto,
  QueueEntryDto,
  SongRequestDto,
  TopRequestDto,
} from './contracts';

/** Socket.IO room naming. Rooms are the only authorisation boundary on the websocket. */
export const RealtimeRoom = {
  customers: (venueId: string): string => `venue:${venueId}:customers`,
  admin: (venueId: string): string => `venue:${venueId}:admin`,
  player: (venueId: string): string => `venue:${venueId}:player`,
  request: (requestId: string): string => `request:${requestId}`,
  /** Everything one guest sent, so their own list can follow it without watching the whole venue. */
  guest: (customerSessionId: string): string => `guest:${customerSessionId}`,
} as const;

export const ServerEvent = {
  RequestCreated: 'request.created',
  RequestUpdated: 'request.updated',
  QueueUpdated: 'queue.updated',
  PlayerUpdated: 'player.updated',
  PlayerNowPlaying: 'player.nowPlaying',
  PlayerCommand: 'player.command',
  VenueStatsUpdated: 'venue.stats.updated',
} as const;
export type ServerEvent = (typeof ServerEvent)[keyof typeof ServerEvent];

/**
 * What a browser may send over the socket.
 *
 * Playback progress is reported over HTTP instead, because those reports mutate the queue inside
 * a transaction; the socket is only used to join and leave rooms.
 */
export const ClientEvent = {
  Subscribe: 'subscribe',
  Unsubscribe: 'unsubscribe',
} as const;
export type ClientEvent = (typeof ClientEvent)[keyof typeof ClientEvent];

export const PlayerCommand = {
  Play: 'play',
  Pause: 'pause',
  Resume: 'resume',
  Skip: 'skip',
  Reload: 'reload',
  LeaseRevoked: 'lease-revoked',
} as const;
export type PlayerCommand = (typeof PlayerCommand)[keyof typeof PlayerCommand];

export interface QueueUpdatedPayload {
  readonly venueId: string;
  readonly current: QueueEntryDto | null;
  readonly upcoming: readonly QueueEntryDto[];
}

export interface PlayerCommandPayload {
  readonly venueId: string;
  readonly command: PlayerCommand;
  readonly issuedAt: string;
}

export interface VenueStatsUpdatedPayload {
  readonly venueId: string;
  readonly topTracks: readonly TopRequestDto[];
}

export interface ServerEventPayloads {
  readonly [ServerEvent.RequestCreated]: SongRequestDto;
  readonly [ServerEvent.RequestUpdated]: SongRequestDto;
  readonly [ServerEvent.QueueUpdated]: QueueUpdatedPayload;
  readonly [ServerEvent.PlayerUpdated]: PlayerStateDto;
  readonly [ServerEvent.PlayerNowPlaying]: NowPlayingDto;
  readonly [ServerEvent.PlayerCommand]: PlayerCommandPayload;
  readonly [ServerEvent.VenueStatsUpdated]: VenueStatsUpdatedPayload;
}

export type RealtimeSubscription =
  | { readonly scope: 'venue-customers'; readonly venueSlug: string }
  | { readonly scope: 'venue-admin'; readonly venueId: string }
  | { readonly scope: 'venue-player'; readonly venueId: string }
  | { readonly scope: 'request'; readonly requestId: string }
  // The guest never names their own session: the server reads it from the session cookie.
  | { readonly scope: 'guest-requests' };
