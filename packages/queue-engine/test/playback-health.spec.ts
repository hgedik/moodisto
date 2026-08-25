import { describe, expect, it } from 'vitest';
import {
  isPermanentPlaybackFailure,
  MAX_CONSECUTIVE_PLAYBACK_FAILURES,
  shouldHaltPlayback,
} from '../src/queue/playback-health';

describe('shouldHaltPlayback', () => {
  it('keeps skipping while the failures stay under the limit', () => {
    expect(shouldHaltPlayback(0)).toBe(false);
    expect(shouldHaltPlayback(MAX_CONSECUTIVE_PLAYBACK_FAILURES - 1)).toBe(false);
  });

  it('halts once that many tracks in a row failed without one reaching the speakers', () => {
    expect(shouldHaltPlayback(MAX_CONSECUTIVE_PLAYBACK_FAILURES)).toBe(true);
    expect(shouldHaltPlayback(MAX_CONSECUTIVE_PLAYBACK_FAILURES + 1)).toBe(true);
  });

  it('gives the venue a budget of more than one attempt', () => {
    // A single unavailable video must never take the whole evening down.
    expect(MAX_CONSECUTIVE_PLAYBACK_FAILURES).toBeGreaterThan(1);
  });
});

describe('isPermanentPlaybackFailure', () => {
  it('treats a provider refusing to embed or serve the video as permanent', () => {
    expect(isPermanentPlaybackFailure('EMBED_NOT_ALLOWED')).toBe(true);
    expect(isPermanentPlaybackFailure('VIDEO_UNAVAILABLE')).toBe(true);
  });

  it('does not blame the track for a problem on the venue side', () => {
    // The catalogue is shared between venues, so one café's blocked network must never take a
    // track away from every other café.
    expect(isPermanentPlaybackFailure('NETWORK_ERROR')).toBe(false);
    expect(isPermanentPlaybackFailure('PLAYER_TIMEOUT')).toBe(false);
    expect(isPermanentPlaybackFailure('')).toBe(false);
  });
});
