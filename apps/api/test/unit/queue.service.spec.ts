import { beforeEach, describe, expect, it } from 'vitest';
import {
  MusicProviderId,
  PlaybackState,
  QueueItemState,
  RealtimeRoom,
  RequestStatus,
  RequestType,
  ServerEvent,
} from '@moodisto/shared-types';
import type {
  PlayerStateRecord,
  QueueEntryRecord,
  RealtimeMessage,
  SongRequestRecord,
  SongRequestStatusChange,
  TrackRecord,
  UnitOfWork,
} from '../../src/application/ports';
import { QueueService } from '../../src/queue/queue.service';

const venueId = 'venue-1';
const now = new Date('2026-08-25T20:00:00.000Z');

const track: TrackRecord = {
  id: 'track-1',
  provider: MusicProviderId.YOUTUBE,
  providerTrackId: 'fake-1',
  title: 'Dudu',
  artist: 'Tarkan',
  channelName: null,
  channelId: null,
  thumbnailUrl: null,
  durationSeconds: 210,
};

const songRequest = (overrides: Partial<SongRequestRecord> = {}): SongRequestRecord => ({
  id: 'request-1',
  venueId,
  venueSlug: 'demo',
  customerSessionId: 'session-1',
  trackId: track.id,
  track,
  requestType: RequestType.NORMAL,
  status: RequestStatus.QUEUED,
  tableLabel: 'Masa 12',
  amountMinor: 0,
  currency: 'TRY',
  rejectionReason: null,
  paymentStatus: null,
  queuePosition: 1,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const queueEntry = (overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord => ({
  id: 'queue-1',
  venueId,
  songRequestId: 'request-1',
  position: 1,
  state: QueueItemState.QUEUED,
  requestType: RequestType.NORMAL,
  track,
  tableLabel: 'Masa 12',
  startedAt: null,
  endedAt: null,
  createdAt: now,
  ...overrides,
});

/**
 * A unit of work that only remembers what it was told.
 *
 * Mocking stops at the port: the fake stores records and published messages so a test can assert
 * on what the service decided, without a database or a socket in the way.
 */
class FakeUnitOfWork {
  readonly published: RealtimeMessage[] = [];
  playerState: PlayerStateRecord | null = null;

  constructor(
    private entries: QueueEntryRecord[],
    private requests: SongRequestRecord[],
  ) {}

  readonly queue = {
    listActive: async (): Promise<readonly QueueEntryRecord[]> =>
      this.entries
        .filter(
          (entry) =>
            entry.state === QueueItemState.QUEUED || entry.state === QueueItemState.PLAYING,
        )
        .sort((left, right) => left.position - right.position),
    findCurrent: async (): Promise<QueueEntryRecord | null> =>
      this.entries.find((entry) => entry.state === QueueItemState.PLAYING) ?? null,
    findById: async (id: string): Promise<QueueEntryRecord | null> =>
      this.entries.find((entry) => entry.id === id) ?? null,
    shiftPositionsBy: async (): Promise<void> => undefined,
    applyPositions: async (): Promise<void> => undefined,
    insert: async (): Promise<QueueEntryRecord> => queueEntry(),
    updateState: async (
      id: string,
      state: QueueItemState,
      timestamps: { startedAt?: Date; endedAt?: Date } = {},
    ): Promise<QueueEntryRecord> => {
      const updated = queueEntry({
        ...this.entries.find((entry) => entry.id === id),
        state,
        startedAt: timestamps.startedAt ?? null,
        endedAt: timestamps.endedAt ?? null,
      });
      this.entries = this.entries.map((entry) => (entry.id === id ? updated : entry));
      return updated;
    },
    claimNextQueued: async (): Promise<QueueEntryRecord | null> =>
      this.entries.find((entry) => entry.state === QueueItemState.QUEUED) ?? null,
    countQueued: async (): Promise<number> =>
      this.entries.filter((entry) => entry.state === QueueItemState.QUEUED).length,
  };

  readonly songRequests = {
    findById: async (id: string): Promise<SongRequestRecord | null> =>
      this.requests.find((request) => request.id === id) ?? null,
    applyStatusChange: async (
      id: string,
      change: SongRequestStatusChange,
    ): Promise<SongRequestRecord> => {
      const current = this.requests.find((request) => request.id === id);
      if (!current) {
        throw new Error(`unknown request ${id}`);
      }
      const updated = { ...current, status: change.status, updatedAt: now };
      this.requests = this.requests.map((request) => (request.id === id ? updated : request));
      return updated;
    },
  };

  readonly player = {
    getState: async (): Promise<PlayerStateRecord | null> => this.playerState,
    saveState: async (input: {
      venueId: string;
      state: PlaybackState;
      queueItemId: string | null;
      startedAt: Date | null;
    }): Promise<PlayerStateRecord> => {
      this.playerState = { ...input, version: 1, updatedAt: now };
      return this.playerState;
    },
  };

  publish(message: RealtimeMessage): void {
    this.published.push(message);
  }

  asUnitOfWork(): UnitOfWork {
    return this as unknown as UnitOfWork;
  }

  statusUpdates(requestId: string): readonly RequestStatus[] {
    return this.published
      .filter(
        (message) =>
          message.event === ServerEvent.RequestUpdated &&
          message.room === RealtimeRoom.request(requestId),
      )
      .map((message) => (message.payload as { status: RequestStatus }).status);
  }
}

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    service = new QueueService();
  });

  it('tells the guest their song started playing', async () => {
    const uow = new FakeUnitOfWork([queueEntry()], [songRequest()]);

    await service.advance(uow.asUnitOfWork(), venueId, now);

    expect(uow.statusUpdates('request-1')).toEqual([RequestStatus.PLAYING]);
  });

  it('tells the guest their song finished', async () => {
    const uow = new FakeUnitOfWork(
      [queueEntry({ state: QueueItemState.PLAYING, startedAt: now })],
      [songRequest({ status: RequestStatus.PLAYING })],
    );

    await service.finishCurrent(uow.asUnitOfWork(), venueId, now, 'COMPLETED');

    expect(uow.statusUpdates('request-1')).toEqual([RequestStatus.COMPLETED]);
  });

  it('tells the guest their song was taken out of the queue', async () => {
    const uow = new FakeUnitOfWork([queueEntry()], [songRequest()]);

    await service.remove(uow.asUnitOfWork(), venueId, 'queue-1', now);

    expect(uow.statusUpdates('request-1')).toEqual([RequestStatus.CANCELLED]);
  });

  it('leaves the player idle and publishes nothing when the queue runs dry', async () => {
    const uow = new FakeUnitOfWork([], []);

    await expect(service.advance(uow.asUnitOfWork(), venueId, now)).resolves.toBeNull();

    expect(uow.playerState?.state).toBe(PlaybackState.IDLE);
    expect(uow.published).toEqual([]);
  });
});
