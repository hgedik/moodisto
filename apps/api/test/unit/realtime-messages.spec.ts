import { describe, expect, it, vi } from 'vitest';
import {
  MusicProviderId,
  RealtimeRoom,
  RequestStatus,
  RequestType,
  ServerEvent,
} from '@moodisto/shared-types';
import type { SongRequestDto } from '@moodisto/shared-types';
import type { UnitOfWork } from '../../src/application/ports';
import { publishRequestUpdated } from '../../src/application/services/realtime-messages';

const request: SongRequestDto = {
  id: 'r1',
  venueId: 'v1',
  venueSlug: 'moodisto-cafe',
  track: {
    id: 't1',
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'p1',
    title: 'Yalnızlık Senfonisi',
    artist: 'Test',
    durationSeconds: 180,
    thumbnailUrl: null,
    channelName: null,
    channelId: null,
  },
  requestType: RequestType.NORMAL,
  status: RequestStatus.QUEUED,
  tableLabel: 'Masa 1',
  amountMinor: 0,
  currency: 'TRY',
  rejectionReason: null,
  paymentStatus: null,
  queuePosition: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const collect = (): { uow: UnitOfWork; rooms: () => string[] } => {
  const published: string[] = [];
  const uow = {
    publish: vi.fn((message: { room: string }) => {
      published.push(message.room);
    }),
  } as unknown as UnitOfWork;
  return { uow, rooms: () => published };
};

describe('publishRequestUpdated', () => {
  it('reaches the console, the request page and the guest who sent it', () => {
    const { uow, rooms } = collect();

    publishRequestUpdated(uow, request, 'cs1');

    expect(rooms()).toEqual([
      RealtimeRoom.admin('v1'),
      RealtimeRoom.request('r1'),
      RealtimeRoom.guest('cs1'),
    ]);
  });

  it('never reaches the venue-wide customer room, which would leak one guest to the others', () => {
    const { uow, rooms } = collect();

    publishRequestUpdated(uow, request, 'cs1');

    expect(rooms()).not.toContain(RealtimeRoom.customers('v1'));
  });

  it('skips the guest room for a request that has no session behind it', () => {
    const { uow, rooms } = collect();

    publishRequestUpdated(uow, request, null);

    expect(rooms()).toEqual([RealtimeRoom.admin('v1'), RealtimeRoom.request('r1')]);
  });

  it('publishes the same payload under the update event to every room', () => {
    const { uow } = collect();

    publishRequestUpdated(uow, request, 'cs1');

    for (const call of vi.mocked(uow.publish).mock.calls) {
      expect(call[0]).toMatchObject({ event: ServerEvent.RequestUpdated, payload: request });
    }
  });
});
