import { RequestStatus } from '@moodisto/shared-types';
import { InvalidStateTransitionError } from '../errors';

export { InvalidStateTransitionError };

/**
 * The only legal moves for a song request.
 *
 * Nothing outside this table may change a request's status, which is what keeps "accepted after
 * rejection" and "playing twice" impossible regardless of which use case is running.
 */
const ALLOWED_REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> =
  Object.freeze({
    [RequestStatus.PENDING_PAYMENT]: [
      RequestStatus.PENDING,
      RequestStatus.FAILED,
      RequestStatus.EXPIRED,
      RequestStatus.CANCELLED,
    ],
    [RequestStatus.PENDING]: [
      RequestStatus.ACCEPTED,
      RequestStatus.REJECTED,
      RequestStatus.CANCELLED,
      RequestStatus.EXPIRED,
    ],
    [RequestStatus.ACCEPTED]: [RequestStatus.QUEUED, RequestStatus.CANCELLED],
    [RequestStatus.QUEUED]: [RequestStatus.PLAYING, RequestStatus.CANCELLED, RequestStatus.FAILED],
    [RequestStatus.PLAYING]: [RequestStatus.COMPLETED, RequestStatus.FAILED],
    [RequestStatus.COMPLETED]: [],
    [RequestStatus.REJECTED]: [],
    [RequestStatus.CANCELLED]: [],
    [RequestStatus.EXPIRED]: [],
    [RequestStatus.FAILED]: [],
  });

export function canTransitionRequest(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_REQUEST_TRANSITIONS[from].includes(to);
}

export function assertRequestTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransitionRequest(from, to)) {
    throw new InvalidStateTransitionError('Song request', from, to);
  }
}

export function isTerminalRequestStatus(status: RequestStatus): boolean {
  return ALLOWED_REQUEST_TRANSITIONS[status].length === 0;
}

/** Statuses that still occupy a slot in the venue's queue. */
export const ACTIVE_REQUEST_STATUSES: readonly RequestStatus[] = Object.freeze([
  RequestStatus.QUEUED,
  RequestStatus.PLAYING,
]);
