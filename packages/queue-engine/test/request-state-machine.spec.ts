import { describe, expect, it } from 'vitest';
import { RequestStatus } from '@moodisto/shared-types';
import {
  InvalidStateTransitionError,
  assertRequestTransition,
  canTransitionRequest,
  isTerminalRequestStatus,
} from '../src/request/request-state-machine';

describe('request state machine', () => {
  it('lets a paid request leave PENDING_PAYMENT for PENDING', () => {
    expect(canTransitionRequest(RequestStatus.PENDING_PAYMENT, RequestStatus.PENDING)).toBe(true);
  });

  it('lets a free request be accepted and queued', () => {
    expect(canTransitionRequest(RequestStatus.PENDING, RequestStatus.ACCEPTED)).toBe(true);
    expect(canTransitionRequest(RequestStatus.ACCEPTED, RequestStatus.QUEUED)).toBe(true);
    expect(canTransitionRequest(RequestStatus.QUEUED, RequestStatus.PLAYING)).toBe(true);
    expect(canTransitionRequest(RequestStatus.PLAYING, RequestStatus.COMPLETED)).toBe(true);
  });

  it('lets a pending request be rejected', () => {
    expect(canTransitionRequest(RequestStatus.PENDING, RequestStatus.REJECTED)).toBe(true);
  });

  it('refuses to accept a request that is still waiting for payment', () => {
    expect(canTransitionRequest(RequestStatus.PENDING_PAYMENT, RequestStatus.ACCEPTED)).toBe(false);
  });

  it('refuses to re-accept a rejected request', () => {
    expect(canTransitionRequest(RequestStatus.REJECTED, RequestStatus.ACCEPTED)).toBe(false);
  });

  it('refuses to move a completed request anywhere', () => {
    expect(canTransitionRequest(RequestStatus.COMPLETED, RequestStatus.PLAYING)).toBe(false);
    expect(canTransitionRequest(RequestStatus.COMPLETED, RequestStatus.QUEUED)).toBe(false);
  });

  it('refuses to skip the queue step between ACCEPTED and PLAYING', () => {
    expect(canTransitionRequest(RequestStatus.ACCEPTED, RequestStatus.PLAYING)).toBe(false);
  });

  it('marks a playback failure from either QUEUED or PLAYING', () => {
    expect(canTransitionRequest(RequestStatus.QUEUED, RequestStatus.FAILED)).toBe(true);
    expect(canTransitionRequest(RequestStatus.PLAYING, RequestStatus.FAILED)).toBe(true);
  });

  it('treats a transition to the same status as a no-op that is not allowed', () => {
    expect(canTransitionRequest(RequestStatus.PENDING, RequestStatus.PENDING)).toBe(false);
  });

  it('throws a descriptive error for an illegal transition', () => {
    expect(() => assertRequestTransition(RequestStatus.COMPLETED, RequestStatus.PLAYING)).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('recognises terminal statuses', () => {
    expect(isTerminalRequestStatus(RequestStatus.COMPLETED)).toBe(true);
    expect(isTerminalRequestStatus(RequestStatus.REJECTED)).toBe(true);
    expect(isTerminalRequestStatus(RequestStatus.CANCELLED)).toBe(true);
    expect(isTerminalRequestStatus(RequestStatus.EXPIRED)).toBe(true);
    expect(isTerminalRequestStatus(RequestStatus.FAILED)).toBe(true);
    expect(isTerminalRequestStatus(RequestStatus.PENDING)).toBe(false);
  });
});
