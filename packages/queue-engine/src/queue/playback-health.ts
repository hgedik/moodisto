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

/**
 * Failure codes the provider itself reports about the track, rather than about this venue's setup.
 */
const PERMANENT_PLAYBACK_FAILURE_CODES: ReadonlySet<string> = new Set([
  'EMBED_NOT_ALLOWED',
  'VIDEO_UNAVAILABLE',
]);

/**
 * Whether a playback failure says something about the track everywhere, or only here.
 *
 * The track catalogue is shared between venues, so only a provider's own verdict on the track — it
 * cannot be embedded, it no longer exists — may take that track away from everyone. A blocked
 * network or a timed-out player is this venue's problem and must never shrink another venue's
 * catalogue.
 */
export function isPermanentPlaybackFailure(code: string): boolean {
  return PERMANENT_PLAYBACK_FAILURE_CODES.has(code);
}
