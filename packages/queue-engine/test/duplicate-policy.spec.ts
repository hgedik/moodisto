import { describe, expect, it } from 'vitest';
import { DuplicateBlockReason, evaluateDuplicate } from '../src/duplicates/duplicate-policy';

const now = new Date('2026-08-25T22:00:00.000Z');

describe('evaluateDuplicate', () => {
  it('allows a track that is neither queued nor recently played', () => {
    const verdict = evaluateDuplicate({
      trackId: 'track-1',
      activeTrackIds: ['track-2'],
      lastCompletedAt: null,
      cooldownMinutes: 30,
      now,
    });

    expect(verdict).toEqual({ blocked: false, reason: null, retryAfterSeconds: null });
  });

  it('blocks a track that is already queued or playing', () => {
    const verdict = evaluateDuplicate({
      trackId: 'track-1',
      activeTrackIds: ['track-1'],
      lastCompletedAt: null,
      cooldownMinutes: 30,
      now,
    });

    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(DuplicateBlockReason.ALREADY_IN_QUEUE);
  });

  it('blocks a track that finished inside the cooldown window', () => {
    const verdict = evaluateDuplicate({
      trackId: 'track-1',
      activeTrackIds: [],
      lastCompletedAt: new Date('2026-08-25T21:50:00.000Z'),
      cooldownMinutes: 30,
      now,
    });

    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(DuplicateBlockReason.COOLDOWN);
    expect(verdict.retryAfterSeconds).toBe(20 * 60);
  });

  it('allows a track once the cooldown window has elapsed', () => {
    const verdict = evaluateDuplicate({
      trackId: 'track-1',
      activeTrackIds: [],
      lastCompletedAt: new Date('2026-08-25T21:20:00.000Z'),
      cooldownMinutes: 30,
      now,
    });

    expect(verdict.blocked).toBe(false);
  });

  it('disables the cooldown check when the venue sets it to zero', () => {
    const verdict = evaluateDuplicate({
      trackId: 'track-1',
      activeTrackIds: [],
      lastCompletedAt: new Date('2026-08-25T21:59:00.000Z'),
      cooldownMinutes: 0,
      now,
    });

    expect(verdict.blocked).toBe(false);
  });

  it('still blocks an already queued track when the cooldown is disabled', () => {
    const verdict = evaluateDuplicate({
      trackId: 'track-1',
      activeTrackIds: ['track-1'],
      lastCompletedAt: null,
      cooldownMinutes: 0,
      now,
    });

    expect(verdict.blocked).toBe(true);
    expect(verdict.reason).toBe(DuplicateBlockReason.ALREADY_IN_QUEUE);
  });
});
