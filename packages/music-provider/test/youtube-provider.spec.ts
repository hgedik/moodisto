import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicProviderId } from '@moodisto/shared-types';
import { YoutubeMusicProvider } from '../src/youtube/youtube-music-provider';
import {
  MusicProviderNotConfiguredError,
  MusicProviderQuotaExceededError,
  MusicProviderUnavailableError,
} from '../src/errors';
import type { HttpFetch } from '../src/ports';

const searchResponse = {
  items: [
    {
      id: { videoId: 'abc123' },
      snippet: {
        title: 'Tarkan - Dudu',
        channelTitle: 'Tarkan Official',
        channelId: 'UC-tarkan',
        thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' } },
      },
    },
    {
      id: { videoId: 'def456' },
      snippet: {
        title: 'Dudu (Live)',
        channelTitle: 'Konser TV',
        channelId: 'UC-konser',
        thumbnails: { default: { url: 'https://i.ytimg.com/vi/def456/default.jpg' } },
      },
    },
  ],
};

const videosResponse = {
  items: [
    { id: 'abc123', contentDetails: { duration: 'PT3M42S' } },
    { id: 'def456', contentDetails: { duration: 'PT1H2M3S' } },
  ],
};

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('YoutubeMusicProvider', () => {
  let calls: string[];
  let httpFetch: HttpFetch;

  beforeEach(() => {
    calls = [];
    httpFetch = vi.fn(async (url: string) => {
      calls.push(url);
      return url.includes('/search') ? okResponse(searchResponse) : okResponse(videosResponse);
    }) as unknown as HttpFetch;
  });

  const provider = (apiKey = 'test-key'): YoutubeMusicProvider =>
    new YoutubeMusicProvider({ apiKey, httpFetch });

  it('identifies itself as the YouTube provider', () => {
    expect(provider().id).toBe(MusicProviderId.YOUTUBE);
  });

  it('declares that its player must stay visible and audio may not be extracted', () => {
    const capabilities = provider().capabilities;

    expect(capabilities.requiresVisiblePlayer).toBe(true);
    expect(capabilities.allowsAudioOnlyPlayback).toBe(false);
    expect(capabilities.allowsBackgroundPlayback).toBe(false);
    expect(capabilities.complianceNotes.length).toBeGreaterThan(0);
  });

  it('searches only for embeddable, syndicated videos', async () => {
    await provider().search('tarkan dudu', { limit: 10 });

    const searchUrl = calls.find((url) => url.includes('/search')) ?? '';
    expect(searchUrl).toContain('type=video');
    expect(searchUrl).toContain('videoEmbeddable=true');
    expect(searchUrl).toContain('videoSyndicated=true');
    expect(searchUrl).toContain('part=snippet');
    expect(searchUrl).toContain('maxResults=10');
    expect(searchUrl).toContain('q=tarkan+dudu');
  });

  it('never puts the api key anywhere except the outbound request', async () => {
    const results = await provider('super-secret').search('tarkan', { limit: 5 });

    expect(JSON.stringify(results)).not.toContain('super-secret');
    expect(calls.every((url) => url.includes('key=super-secret'))).toBe(true);
  });

  it('maps search results into provider agnostic tracks', async () => {
    const results = await provider().search('tarkan dudu', { limit: 10 });

    expect(results[0]).toEqual({
      provider: MusicProviderId.YOUTUBE,
      providerTrackId: 'abc123',
      title: 'Dudu',
      artist: 'Tarkan',
      channelName: 'Tarkan Official',
      channelId: 'UC-tarkan',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg',
      durationSeconds: 222,
    });
  });

  it('falls back to the channel as the artist when the title has no separator', async () => {
    const results = await provider().search('dudu live', { limit: 10 });

    expect(results[1]?.title).toBe('Dudu (Live)');
    expect(results[1]?.artist).toBe('Konser TV');
  });

  it('parses hour long durations', async () => {
    const results = await provider().search('dudu live', { limit: 10 });

    expect(results[1]?.durationSeconds).toBe(3723);
  });

  it('resolves a single track by id', async () => {
    const track = await provider().getTrack('abc123');

    expect(track?.providerTrackId).toBe('abc123');
    expect(track?.durationSeconds).toBe(222);
  });

  it('returns null for a track the provider does not know', async () => {
    const emptyFetch = vi.fn(async () => okResponse({ items: [] })) as unknown as HttpFetch;

    const track = await new YoutubeMusicProvider({ apiKey: 'k', httpFetch: emptyFetch }).getTrack(
      'missing',
    );

    expect(track).toBeNull();
  });

  it('describes playback as an embedded iframe', async () => {
    const source = await provider().getPlaybackSource('abc123');

    expect(source).toEqual({
      kind: 'EMBEDDED_IFRAME',
      provider: MusicProviderId.YOUTUBE,
      providerTrackId: 'abc123',
      origin: null,
    });
  });

  it('raises a quota error when YouTube reports the search allowance is spent', async () => {
    const quotaFetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }),
      text: async () => 'quotaExceeded',
    })) as unknown as HttpFetch;

    await expect(
      new YoutubeMusicProvider({ apiKey: 'k', httpFetch: quotaFetch }).search('tarkan', {
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(MusicProviderQuotaExceededError);
  });

  it('raises an unavailable error for any other failure', async () => {
    const failingFetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'boom',
    })) as unknown as HttpFetch;

    await expect(
      new YoutubeMusicProvider({ apiKey: 'k', httpFetch: failingFetch }).search('tarkan', {
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(MusicProviderUnavailableError);
  });

  it('refuses to run without an api key instead of leaking an unauthenticated call', async () => {
    await expect(provider('').search('tarkan', { limit: 5 })).rejects.toBeInstanceOf(
      MusicProviderNotConfiguredError,
    );
  });
});

describe('YoutubeMusicProvider quota', () => {
  it('declares what YouTube charges, so the application never hard-codes it', () => {
    const provider = new YoutubeMusicProvider({ apiKey: 'test-key', httpFetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
      text: async () => '',
    }) });

    // A search is one search.list (100) plus the videos.list (1) needed to complete the results.
    expect(provider.quota.searchUnits).toBe(101);
    expect(provider.quota.trackLookupUnits).toBe(1);
    expect(provider.quota.dailyUnits).toBe(10_000);
    // YouTube's allowance resets at midnight Pacific, not at midnight where the venue is.
    expect(provider.quota.resetTimeZone).toBe('America/Los_Angeles');
  });
});
