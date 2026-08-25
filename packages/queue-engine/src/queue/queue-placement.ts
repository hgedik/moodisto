import { RequestType } from '@moodisto/shared-types';
import { QueueReorderMismatchError } from '../errors';

/**
 * Ordering weight of each request type. Lower wins.
 *
 * The currently playing slot is weighted below every request type so that it can never be
 * displaced by an incoming request.
 */
export const REQUEST_TYPE_RANK: Readonly<Record<RequestType, number>> = Object.freeze({
  [RequestType.PLAY_NEXT]: 0,
  [RequestType.PRIORITY]: 1,
  [RequestType.DJ]: 2,
  [RequestType.NORMAL]: 3,
});

const PLAYING_RANK = -1;

export type ActiveQueueSlotState = 'PLAYING' | 'QUEUED';

/** A queue row that still occupies a position: either playing right now, or waiting to play. */
export interface ActiveQueueSlot {
  readonly id: string;
  readonly position: number;
  readonly state: ActiveQueueSlotState;
  readonly requestType: RequestType;
}

export interface QueuePositionAssignment {
  readonly id: string;
  readonly position: number;
}

const rankOf = (slot: ActiveQueueSlot): number =>
  slot.state === 'PLAYING' ? PLAYING_RANK : REQUEST_TYPE_RANK[slot.requestType];

const byPosition = (slots: readonly ActiveQueueSlot[]): ActiveQueueSlot[] =>
  [...slots].sort((left, right) => left.position - right.position);

/**
 * Decides which position an incoming request should take.
 *
 * The rule is "land behind the last slot of equal-or-higher rank". On a rank-ordered queue this
 * produces the documented tier order (play-next, priority, dj, normal) with FIFO inside each
 * tier. On a queue an admin has reordered by hand it preserves that manual ordering instead of
 * jumping ahead of it, because the admin has the final say over the queue.
 *
 * Every existing slot at or after the returned position must be shifted one place back; see
 * {@link selectPositionsToShift}.
 */
export function resolveInsertionPosition(
  activeQueue: readonly ActiveQueueSlot[],
  incoming: RequestType,
): number {
  const ordered = byPosition(activeQueue);
  if (ordered.length === 0) {
    return 1;
  }

  const incomingRank = REQUEST_TYPE_RANK[incoming];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const slot = ordered[index] as ActiveQueueSlot;
    if (rankOf(slot) <= incomingRank) {
      return slot.position + 1;
    }
  }

  return (ordered[0] as ActiveQueueSlot).position;
}

/** Ids of the slots that have to move one position back to make room at `insertPosition`. */
export function selectPositionsToShift(
  activeQueue: readonly ActiveQueueSlot[],
  insertPosition: number,
): string[] {
  return byPosition(activeQueue)
    .filter((slot) => slot.position >= insertPosition)
    .map((slot) => slot.id);
}

/**
 * Turns an admin drag-and-drop ordering into a complete renumbering of the venue's active queue.
 *
 * `orderedQueuedIds` must be an exact permutation of the queue's waiting items. The playing item
 * is not reorderable and always keeps the first position.
 */
export function planReorder(
  activeQueue: readonly ActiveQueueSlot[],
  orderedQueuedIds: readonly string[],
): QueuePositionAssignment[] {
  const ordered = byPosition(activeQueue);
  const playing = ordered.filter((slot) => slot.state === 'PLAYING');
  const queued = ordered.filter((slot) => slot.state === 'QUEUED');

  const requested = new Set(orderedQueuedIds);
  if (requested.size !== orderedQueuedIds.length) {
    throw new QueueReorderMismatchError('The requested ordering contains duplicate queue items');
  }

  const playingIds = new Set(playing.map((slot) => slot.id));
  const conflicting = orderedQueuedIds.find((id) => playingIds.has(id));
  if (conflicting !== undefined) {
    throw new QueueReorderMismatchError('The currently playing item cannot be reordered');
  }

  const queuedIds = new Set(queued.map((slot) => slot.id));
  const unknown = orderedQueuedIds.find((id) => !queuedIds.has(id));
  if (unknown !== undefined) {
    throw new QueueReorderMismatchError(`Queue item ${unknown} is not waiting in this queue`);
  }
  if (orderedQueuedIds.length !== queued.length) {
    throw new QueueReorderMismatchError(
      `The requested ordering covers ${orderedQueuedIds.length} of ${queued.length} waiting items`,
    );
  }

  const assignments: QueuePositionAssignment[] = [];
  let position = 1;
  for (const slot of playing) {
    assignments.push({ id: slot.id, position });
    position += 1;
  }
  for (const id of orderedQueuedIds) {
    assignments.push({ id, position });
    position += 1;
  }
  return assignments;
}

/** Renumbers the active queue to 1..n while preserving its current order. Used after removals. */
export function planCompaction(activeQueue: readonly ActiveQueueSlot[]): QueuePositionAssignment[] {
  return byPosition(activeQueue).map((slot, index) => ({ id: slot.id, position: index + 1 }));
}
