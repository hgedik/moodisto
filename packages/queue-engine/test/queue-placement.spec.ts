import { describe, expect, it } from 'vitest';
import { RequestType } from '@moodisto/shared-types';
import { QueueReorderMismatchError } from '../src/errors';
import {
  planReorder,
  resolveInsertionPosition,
  selectPositionsToShift,
  type ActiveQueueSlot,
} from '../src/queue/queue-placement';

const slot = (
  id: string,
  position: number,
  requestType: RequestType,
  state: ActiveQueueSlot['state'] = 'QUEUED',
): ActiveQueueSlot => ({ id, position, requestType, state });

describe('resolveInsertionPosition', () => {
  it('places the first request of an empty queue at position 1', () => {
    expect(resolveInsertionPosition([], RequestType.NORMAL)).toBe(1);
  });

  it('appends a normal request to the end of the queue', () => {
    const queue = [
      slot('a', 1, RequestType.NORMAL, 'PLAYING'),
      slot('b', 2, RequestType.NORMAL),
      slot('c', 3, RequestType.NORMAL),
    ];

    expect(resolveInsertionPosition(queue, RequestType.NORMAL)).toBe(4);
  });

  it('never displaces the currently playing item', () => {
    const queue = [slot('playing', 1, RequestType.NORMAL, 'PLAYING')];

    expect(resolveInsertionPosition(queue, RequestType.PLAY_NEXT)).toBe(2);
  });

  it('places a play-next request directly after the playing item', () => {
    const queue = [
      slot('playing', 1, RequestType.NORMAL, 'PLAYING'),
      slot('priority', 2, RequestType.PRIORITY),
      slot('normal', 3, RequestType.NORMAL),
    ];

    expect(resolveInsertionPosition(queue, RequestType.PLAY_NEXT)).toBe(2);
  });

  it('keeps FIFO order between two play-next requests', () => {
    const queue = [
      slot('playing', 1, RequestType.NORMAL, 'PLAYING'),
      slot('pn1', 2, RequestType.PLAY_NEXT),
      slot('priority', 3, RequestType.PRIORITY),
    ];

    expect(resolveInsertionPosition(queue, RequestType.PLAY_NEXT)).toBe(3);
  });

  it('places a priority request after existing priority requests but before dj and normal', () => {
    const queue = [
      slot('playing', 1, RequestType.NORMAL, 'PLAYING'),
      slot('pn', 2, RequestType.PLAY_NEXT),
      slot('p1', 3, RequestType.PRIORITY),
      slot('p2', 4, RequestType.PRIORITY),
      slot('dj', 5, RequestType.DJ),
      slot('n1', 6, RequestType.NORMAL),
    ];

    expect(resolveInsertionPosition(queue, RequestType.PRIORITY)).toBe(5);
  });

  it('places a dj request after priority requests and before normal requests', () => {
    const queue = [slot('p1', 1, RequestType.PRIORITY), slot('n1', 2, RequestType.NORMAL)];

    expect(resolveInsertionPosition(queue, RequestType.DJ)).toBe(2);
  });

  it('respects a manual reorder instead of jumping ahead of it', () => {
    // An admin dragged a normal request above a priority request. A new priority request lands
    // after the last slot of equal-or-higher rank, so the manual promotion survives.
    const queue = [slot('n1', 1, RequestType.NORMAL), slot('p1', 2, RequestType.PRIORITY)];

    expect(resolveInsertionPosition(queue, RequestType.PRIORITY)).toBe(3);
  });

  it('inserts at the head when no slot has an equal-or-higher rank', () => {
    const queue = [slot('n1', 1, RequestType.NORMAL), slot('n2', 2, RequestType.NORMAL)];

    expect(resolveInsertionPosition(queue, RequestType.PRIORITY)).toBe(1);
  });

  it('tolerates non-contiguous positions', () => {
    const queue = [slot('a', 4, RequestType.NORMAL), slot('b', 9, RequestType.NORMAL)];

    expect(resolveInsertionPosition(queue, RequestType.NORMAL)).toBe(10);
  });

  it('sorts defensively when the caller passes an unsorted queue', () => {
    const queue = [slot('b', 3, RequestType.NORMAL), slot('a', 1, RequestType.PRIORITY)];

    expect(resolveInsertionPosition(queue, RequestType.PRIORITY)).toBe(2);
  });
});

describe('selectPositionsToShift', () => {
  it('returns the ids of every active item at or after the insertion position', () => {
    const queue = [
      slot('a', 1, RequestType.NORMAL, 'PLAYING'),
      slot('b', 2, RequestType.NORMAL),
      slot('c', 3, RequestType.NORMAL),
    ];

    expect(selectPositionsToShift(queue, 2)).toEqual(['b', 'c']);
  });

  it('returns an empty list when appending', () => {
    const queue = [slot('a', 1, RequestType.NORMAL)];

    expect(selectPositionsToShift(queue, 2)).toEqual([]);
  });
});

describe('planReorder', () => {
  it('renumbers the queued items into the requested order starting after the playing item', () => {
    const queue = [
      slot('playing', 1, RequestType.NORMAL, 'PLAYING'),
      slot('a', 2, RequestType.NORMAL),
      slot('b', 3, RequestType.NORMAL),
      slot('c', 4, RequestType.NORMAL),
    ];

    expect(planReorder(queue, ['c', 'a', 'b'])).toEqual([
      { id: 'playing', position: 1 },
      { id: 'c', position: 2 },
      { id: 'a', position: 3 },
      { id: 'b', position: 4 },
    ]);
  });

  it('renumbers from position 1 when nothing is playing', () => {
    const queue = [slot('a', 7, RequestType.NORMAL), slot('b', 8, RequestType.NORMAL)];

    expect(planReorder(queue, ['b', 'a'])).toEqual([
      { id: 'b', position: 1 },
      { id: 'a', position: 2 },
    ]);
  });

  it('rejects an ordering that omits a queued item', () => {
    const queue = [slot('a', 1, RequestType.NORMAL), slot('b', 2, RequestType.NORMAL)];

    expect(() => planReorder(queue, ['a'])).toThrow(QueueReorderMismatchError);
  });

  it('rejects an ordering that references an unknown item', () => {
    const queue = [slot('a', 1, RequestType.NORMAL)];

    expect(() => planReorder(queue, ['a', 'ghost'])).toThrow(QueueReorderMismatchError);
  });

  it('rejects an ordering that contains duplicates', () => {
    const queue = [slot('a', 1, RequestType.NORMAL), slot('b', 2, RequestType.NORMAL)];

    expect(() => planReorder(queue, ['a', 'a'])).toThrow(QueueReorderMismatchError);
  });

  it('rejects an attempt to reorder the playing item', () => {
    const queue = [
      slot('playing', 1, RequestType.NORMAL, 'PLAYING'),
      slot('a', 2, RequestType.NORMAL),
    ];

    expect(() => planReorder(queue, ['playing', 'a'])).toThrow(QueueReorderMismatchError);
  });
});
