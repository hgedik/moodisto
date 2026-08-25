/**
 * How many tracks may fail to play, one after another, before the venue's player stops trying.
 *
 * A single unavailable or non-embeddable video is normal and must be skipped silently. A whole
 * run of them is not a song problem but a venue problem — a blocked network, an expired provider
 * key, a catalogue that cannot be embedded — and skipping through it would empty the queue of
 * every request the guests made in seconds.
 */
export const MAX_CONSECUTIVE_PLAYBACK_FAILURES = 3;

/**
 * Decides whether the player should stop advancing and wait for the venue.
 *
 * @param consecutiveFailures Tracks that failed since the last one that reached the speakers.
 */
export function shouldHaltPlayback(consecutiveFailures: number): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_PLAYBACK_FAILURES;
}
