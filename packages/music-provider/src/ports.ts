import type { MusicProviderId } from '@moodisto/shared-types';

/**
 * A track as a provider describes it. Nothing here is YouTube specific: the domain only ever
 * knows `provider` plus `providerTrackId`, which is what makes swapping to a licensed provider a
 * single-package change.
 */
export interface TrackSearchResult {
  readonly provider: MusicProviderId;
  readonly providerTrackId: string;
  readonly title: string;
  readonly artist: string | null;
  readonly channelName: string | null;
  readonly channelId: string | null;
  readonly thumbnailUrl: string | null;
  readonly durationSeconds: number | null;
}

export interface ProviderTrack extends TrackSearchResult {
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * How the venue player is expected to render this track.
 *
 * `EMBEDDED_IFRAME` means the provider's own visible player must be used, ads and all. Moodisto
 * never extracts audio from a provider that requires its player to stay visible.
 */
export interface PlaybackSource {
  readonly kind: 'EMBEDDED_IFRAME';
  readonly provider: MusicProviderId;
  readonly providerTrackId: string;
  readonly origin: string | null;
}

/**
 * What a provider is contractually allowed to do. Surfaced to venue admins as a compliance
 * warning; it never silently switches product features off.
 */
export interface MusicProviderCapabilities {
  readonly supportsPaidRequests: boolean;
  readonly requiresVisiblePlayer: boolean;
  readonly allowsAudioOnlyPlayback: boolean;
  readonly allowsBackgroundPlayback: boolean;
  readonly complianceNotes: readonly string[];
}

export interface MusicSearchOptions {
  readonly limit: number;
}

export interface MusicProvider {
  readonly id: MusicProviderId;
  readonly capabilities: MusicProviderCapabilities;
  search(query: string, options: MusicSearchOptions): Promise<TrackSearchResult[]>;
  getTrack(providerTrackId: string): Promise<ProviderTrack | null>;
  getPlaybackSource(providerTrackId: string): Promise<PlaybackSource>;
}

/** Persistence port for the search cache. Implemented outside this package. */
export interface MusicSearchCache {
  read(provider: MusicProviderId, normalizedQuery: string): Promise<TrackSearchResult[] | null>;
  write(
    provider: MusicProviderId,
    normalizedQuery: string,
    results: readonly TrackSearchResult[],
    ttlSeconds: number,
  ): Promise<void>;
}

/** Minimal HTTP port so provider adapters stay unit-testable without a network. */
export type HttpFetch = (
  url: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;
