import {
  PlayerCommand,
  RealtimeRoom,
  ServerEvent,
  type NowPlayingDto,
  type PlayerStateDto,
  type QueueUpdatedPayload,
  type SongRequestDto,
  type TopRequestDto,
} from '@moodisto/shared-types';
import type { RealtimeMessage, UnitOfWork } from '../ports';

/** Everyone who can see the venue's queue: customers, the admin console and the player tab. */
const venueAudience = (venueId: string): readonly string[] => [
  RealtimeRoom.customers(venueId),
  RealtimeRoom.admin(venueId),
  RealtimeRoom.player(venueId),
];

const fanOut = <E extends ServerEvent>(
  rooms: readonly string[],
  event: E,
  payload: Extract<RealtimeMessage, { event: E }>['payload'],
): RealtimeMessage[] =>
  rooms.map((room) => ({ room, event, payload }) as unknown as RealtimeMessage);

export const publishQueueUpdated = (uow: UnitOfWork, payload: QueueUpdatedPayload): void => {
  for (const message of fanOut(venueAudience(payload.venueId), ServerEvent.QueueUpdated, payload)) {
    uow.publish(message);
  }
};

export const publishPlayerUpdated = (uow: UnitOfWork, payload: PlayerStateDto): void => {
  for (const room of [RealtimeRoom.admin(payload.venueId), RealtimeRoom.player(payload.venueId)]) {
    uow.publish({ room, event: ServerEvent.PlayerUpdated, payload });
  }
};

export const publishNowPlaying = (
  uow: UnitOfWork,
  venueId: string,
  payload: NowPlayingDto,
): void => {
  for (const message of fanOut(venueAudience(venueId), ServerEvent.PlayerNowPlaying, payload)) {
    uow.publish(message);
  }
};

export const publishPlayerCommand = (
  uow: UnitOfWork,
  venueId: string,
  command: PlayerCommand,
  issuedAt: Date,
): void => {
  uow.publish({
    room: RealtimeRoom.player(venueId),
    event: ServerEvent.PlayerCommand,
    payload: { venueId, command, issuedAt: issuedAt.toISOString() },
  });
};

export const publishRequestCreated = (uow: UnitOfWork, payload: SongRequestDto): void => {
  uow.publish({
    room: RealtimeRoom.admin(payload.venueId),
    event: ServerEvent.RequestCreated,
    payload,
  });
};

/**
 * The customer follows their own request through rooms only they can join — the request's own room
 * and the room of the guest session behind it — never through the venue-wide customer room, which
 * would show one guest's request to everybody else in the venue.
 */
export const publishRequestUpdated = (
  uow: UnitOfWork,
  payload: SongRequestDto,
  customerSessionId: string | null,
): void => {
  const rooms = [RealtimeRoom.admin(payload.venueId), RealtimeRoom.request(payload.id)];
  if (customerSessionId) {
    rooms.push(RealtimeRoom.guest(customerSessionId));
  }
  for (const room of rooms) {
    uow.publish({ room, event: ServerEvent.RequestUpdated, payload });
  }
};

export const publishStatsUpdated = (
  uow: UnitOfWork,
  venueId: string,
  topTracks: readonly TopRequestDto[],
): void => {
  for (const message of fanOut(venueAudience(venueId), ServerEvent.VenueStatsUpdated, {
    venueId,
    topTracks,
  })) {
    uow.publish(message);
  }
};

export { PlayerCommand };
