import { MusicProviderId } from '@moodisto/shared-types';
import {
  MusicProviderNotConfiguredError,
  MusicProviderQuotaExceededError,
  MusicProviderUnavailableError,
} from '../errors';
import type {
  HttpFetch,
  MusicProvider,
  MusicProviderCapabilities,
  MusicProviderQuota,
  MusicSearchOptions,
  PlaybackSource,
  ProviderTrack,
  TrackSearchResult,
} from '../ports';
import { parseIso8601DurationSeconds } from './iso8601-duration';
import { parseVideoTitle } from './parse-video-title';

const API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube's published terms restrict the service to personal, non-commercial use, forbid
 * separating the audio from the video, and forbid background-only playback. Moodisto therefore
 * treats YouTube strictly as a development and demo provider and surfaces these notes to venue
 * admins instead of hiding them.
 */
const YOUTUBE_CAPABILITIES: MusicProviderCapabilities = Object.freeze({
  supportsPaidRequests: false,
  requiresVisiblePlayer: true,
  allowsAudioOnlyPlayback: false,
  allowsBackgroundPlayback: false,
  complianceNotes: Object.freeze([
    'YouTube Terms of Service restrict public performance and commercial music streaming.',
    'The embedded player must stay visible; audio may not be separated from the video.',
    'Background-only playback and ad blocking are forbidden by the API Services Terms.',
    'Move to a licensed provider before charging customers for playback in a venue.',
  ]),
});

/**
 * YouTube Data API v3's price list, against the free daily allowance every project gets.
 *
 * A search costs a `search.list` (100 units) plus the single `videos.list` (1 unit) this adapter
 * needs to fill in durations — roughly 94 searches a day once the request reserve is held back.
 * That number is exactly why Moodisto searches its own catalogue first.
 */
const YOUTUBE_QUOTA: MusicProviderQuota = Object.freeze({
  dailyUnits: 10_000,
  searchUnits: 101,
  trackLookupUnits: 1,
  resetTimeZone: 'America/Los_Angeles',
});

export interface YoutubeMusicProviderOptions {
  readonly apiKey: string;
  readonly httpFetch: HttpFetch;
  /** Optional regional bias, e.g. `TR`. */
  readonly regionCode?: string | null;
  readonly relevanceLanguage?: string | null;
}

interface YoutubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    channelId?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
}

interface YoutubeVideoItem {
  id?: string;
  snippet?: YoutubeSearchItem['snippet'];
  contentDetails?: { duration?: string };
}

const THUMBNAIL_PREFERENCE = ['medium', 'high', 'standard', 'default', 'maxres'] as const;

type ThumbnailMap = Record<string, { url?: string } | undefined>;

function pickThumbnail(thumbnails: ThumbnailMap | undefined): string | null {
  if (thumbnails === undefined) {
    return null;
  }
  for (const size of THUMBNAIL_PREFERENCE) {
    const url = thumbnails[size]?.url;
    if (typeof url === 'string' && url.length > 0) {
      return url;
    }
  }
  return null;
}

export class YoutubeMusicProvider implements MusicProvider {
  public readonly id = MusicProviderId.YOUTUBE;
  public readonly capabilities = YOUTUBE_CAPABILITIES;
  public readonly quota = YOUTUBE_QUOTA;

  private readonly apiKey: string;
  private readonly httpFetch: HttpFetch;
  private readonly regionCode: string | null;
  private readonly relevanceLanguage: string | null;

  public constructor(options: YoutubeMusicProviderOptions) {
    this.apiKey = options.apiKey;
    this.httpFetch = options.httpFetch;
    this.regionCode = options.regionCode ?? null;
    this.relevanceLanguage = options.relevanceLanguage ?? null;
  }

  public async search(query: string, options: MusicSearchOptions): Promise<TrackSearchResult[]> {
    this.assertConfigured();

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      maxResults: String(options.limit),
      q: query,
      key: this.apiKey,
    });
    if (this.regionCode !== null) {
      params.set('regionCode', this.regionCode);
    }
    if (this.relevanceLanguage !== null) {
      params.set('relevanceLanguage', this.relevanceLanguage);
    }

    const payload = await this.request<{ items?: YoutubeSearchItem[] }>(
      `/search?${params.toString()}`,
    );
    const items = payload.items ?? [];
    const videoIds = items
      .map((item) => item.id?.videoId)
      .filter((videoId): videoId is string => typeof videoId === 'string' && videoId.length > 0);

    if (videoIds.length === 0) {
      return [];
    }

    const durations = await this.fetchDurations(videoIds);

    return items.flatMap((item) => {
      const videoId = item.id?.videoId;
      if (videoId === undefined) {
        return [];
      }
      return [this.toSearchResult(videoId, item.snippet, durations.get(videoId) ?? null)];
    });
  }

  public async getTrack(providerTrackId: string): Promise<ProviderTrack | null> {
    this.assertConfigured();

    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      id: providerTrackId,
      key: this.apiKey,
    });
    const payload = await this.request<{ items?: YoutubeVideoItem[] }>(
      `/videos?${params.toString()}`,
    );
    const item = payload.items?.[0];
    if (item === undefined) {
      return null;
    }

    const durationSeconds = parseIso8601DurationSeconds(item.contentDetails?.duration);
    const result = this.toSearchResult(providerTrackId, item.snippet, durationSeconds);
    return { ...result, metadata: { rawTitle: item.snippet?.title ?? null } };
  }

  public async getPlaybackSource(providerTrackId: string): Promise<PlaybackSource> {
    return {
      kind: 'EMBEDDED_IFRAME',
      provider: MusicProviderId.YOUTUBE,
      providerTrackId,
      origin: null,
    };
  }

  private toSearchResult(
    videoId: string,
    snippet: YoutubeSearchItem['snippet'],
    durationSeconds: number | null,
  ): TrackSearchResult {
    const rawTitle = snippet?.title ?? videoId;
    const channelName = snippet?.channelTitle ?? null;
    const parsed = parseVideoTitle(rawTitle);
    return {
      provider: MusicProviderId.YOUTUBE,
      providerTrackId: videoId,
      title: parsed.title,
      artist: parsed.artist ?? channelName,
      channelName,
      channelId: snippet?.channelId ?? null,
      thumbnailUrl: pickThumbnail(snippet?.thumbnails),
      durationSeconds,
    };
  }

  private async fetchDurations(videoIds: readonly string[]): Promise<Map<string, number>> {
    const params = new URLSearchParams({
      part: 'contentDetails',
      id: videoIds.join(','),
      key: this.apiKey,
    });
    const payload = await this.request<{ items?: YoutubeVideoItem[] }>(
      `/videos?${params.toString()}`,
    );
    const durations = new Map<string, number>();
    for (const item of payload.items ?? []) {
      const seconds = parseIso8601DurationSeconds(item.contentDetails?.duration);
      if (item.id !== undefined && seconds !== null) {
        durations.set(item.id, seconds);
      }
    }
    return durations;
  }

  private assertConfigured(): void {
    if (this.apiKey.trim() === '') {
      throw new MusicProviderNotConfiguredError(this.id);
    }
  }

  private async request<T>(path: string): Promise<T> {
    let response: Awaited<ReturnType<HttpFetch>>;
    try {
      response = await this.httpFetch(`${API_BASE_URL}${path}`);
    } catch (cause) {
      throw new MusicProviderUnavailableError(this.id, (cause as Error).message);
    }

    if (!response.ok) {
      if (response.status === 403 && (await this.isQuotaError(response))) {
        throw new MusicProviderQuotaExceededError(this.id);
      }
      throw new MusicProviderUnavailableError(this.id, `HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private async isQuotaError(response: Awaited<ReturnType<HttpFetch>>): Promise<boolean> {
    try {
      const body = (await response.json()) as {
        error?: { errors?: { reason?: string }[] };
      };
      return (body.error?.errors ?? []).some(
        (entry) => entry.reason === 'quotaExceeded' || entry.reason === 'rateLimitExceeded',
      );
    } catch {
      return false;
    }
  }
}
