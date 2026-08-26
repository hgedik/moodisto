import { describe, expect, it } from 'vitest';
import { MusicProviderId } from '@moodisto/shared-types';
import type { MusicProvider } from '@moodisto/music-provider';
import {
  RuntimeMusicProvider,
  type MusicSettings,
  type MusicSettingsSource,
} from '../../src/music/runtime-music-provider';

/**
 * The provider an operator picks in the panel has to be the provider the next search uses, without
 * anybody restarting the API. These tests hold that promise, and the one that goes with it: the
 * adapter is rebuilt when the settings change, and only then.
 */
describe('runtime music provider', () => {
  const settingsWith = (overrides: Partial<MusicSettings> = {}): MusicSettings => ({
    useFakeProvider: true,
    youtubeApiKey: '',
    youtubeRegionCode: 'TR',
    youtubeRelevanceLanguage: 'tr',
    ...overrides,
  });

  class StubSource implements MusicSettingsSource {
    constructor(private music: MusicSettings) {}

    current(): { readonly music: MusicSettings } {
      return { music: this.music };
    }

    async effective(): Promise<{ readonly music: MusicSettings }> {
      return { music: this.music };
    }

    change(music: MusicSettings): void {
      this.music = music;
    }
  }

  const stubAdapter = (label: string): MusicProvider =>
    ({
      id: MusicProviderId.YOUTUBE,
      capabilities: { complianceNotes: [label] },
      quota: { dailyUnits: 1, searchUnits: 1, trackLookupUnits: 1, resetTimeZone: 'UTC' },
      search: async () => [],
      getTrack: async () => null,
      getPlaybackSource: async () => ({
        kind: 'EMBEDDED_IFRAME' as const,
        provider: MusicProviderId.YOUTUBE,
        providerTrackId: label,
        origin: null,
      }),
    }) as unknown as MusicProvider;

  const build = (): { provider: RuntimeMusicProvider; source: StubSource; built: string[] } => {
    const source = new StubSource(settingsWith());
    const built: string[] = [];
    const provider = new RuntimeMusicProvider(source, (music) => {
      const label = music.useFakeProvider ? 'fake' : `youtube:${music.youtubeApiKey}`;
      built.push(label);
      return stubAdapter(label);
    });
    return { provider, source, built };
  };

  it('builds an adapter up front so the synchronous contract can be answered', () => {
    const { provider, built } = build();

    expect(built).toEqual(['fake']);
    expect(provider.id).toBe(MusicProviderId.YOUTUBE);
    expect(provider.quota.dailyUnits).toBe(1);
  });

  it('keeps using the same adapter while the settings do not change', async () => {
    const { provider, built } = build();

    await provider.search('tarkan', { limit: 5 });
    await provider.search('sezen', { limit: 5 });

    expect(built).toEqual(['fake']);
  });

  it('rebuilds the adapter as soon as the settings change', async () => {
    const { provider, source, built } = build();
    await provider.search('tarkan', { limit: 5 });

    source.change(settingsWith({ useFakeProvider: false, youtubeApiKey: 'key-one' }));
    const playback = await provider.getPlaybackSource('anything');

    expect(built).toEqual(['fake', 'youtube:key-one']);
    expect(playback.providerTrackId).toBe('youtube:key-one');
  });

  it('rebuilds when only the credential changes', async () => {
    const { provider, source, built } = build();
    source.change(settingsWith({ useFakeProvider: false, youtubeApiKey: 'key-one' }));
    await provider.getTrack('anything');

    source.change(settingsWith({ useFakeProvider: false, youtubeApiKey: 'key-two' }));
    await provider.getTrack('anything');

    expect(built).toEqual(['fake', 'youtube:key-one', 'youtube:key-two']);
  });
});
