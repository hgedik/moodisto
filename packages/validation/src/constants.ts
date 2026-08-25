/**
 * Search is the only customer action that costs external API quota, so its limits live in one
 * place and are enforced on both sides of the wire.
 */
export const MIN_SEARCH_QUERY_LENGTH = 3;
export const MAX_SEARCH_QUERY_LENGTH = 120;
export const SEARCH_DEBOUNCE_MS = 700;
export const MAX_SEARCH_RESULTS = 10;
export const SEARCH_CACHE_TTL_HOURS = 24;

/**
 * Provider units held back from search so that finishing a request always works.
 *
 * A guest who has already chosen their song must never be told to come back tomorrow because the
 * evening's searching used up the allowance. Sized for a busy night of first-time tracks.
 */
export const PROVIDER_QUOTA_REQUEST_RESERVE_UNITS = 500;

export const MAX_TABLE_LABEL_LENGTH = 40;
export const MAX_REJECTION_REASON_LENGTH = 280;
export const MAX_BLOCKED_RULE_VALUE_LENGTH = 200;

export const PLAYER_HEARTBEAT_INTERVAL_SECONDS = 5;
export const PLAYER_LEASE_STALE_AFTER_SECONDS = 15;

export const DEFAULT_NEARBY_RADIUS_METERS = 5_000;
export const MAX_NEARBY_RADIUS_METERS = 50_000;
export const MAX_NEARBY_RESULTS = 25;
