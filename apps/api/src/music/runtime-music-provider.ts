import type {
  MusicProvider,
  MusicProviderCapabilities,
  MusicProviderQuota,
  MusicSearchOptions,
  PlaybackSource,
  ProviderTrack,
  TrackSearchResult,
} from '@moodisto/music-provider';
import type { MusicProviderId } from '@moodisto/shared-types';
import { RuntimeAdapter } from '../settings/runtime-adapter';
import type { EffectiveSettings } from '../settings/settings-resolver';

export type MusicSettings = EffectiveSettings['music'];

/** The slice of the settings service this provider needs, and nothing more. */
export interface MusicSettingsSource {
  current(): { readonly music: MusicSettings };
  effective(): Promise<{ readonly music: MusicSettings }>;
}

export type MusicAdapterFactory = (settings: MusicSettings) => MusicProvider;

const signatureOf = (settings: MusicSettings): string =>
  [
    settings.useFakeProvider ? 'fake' : 'live',
    settings.youtubeApiKey,
    settings.youtubeRegionCode,
    settings.youtubeRelevanceLanguage,
  ].join('|');

/**
 * Keeps the active music adapter in step with the system settings.
 *
 * Every call asks what the configuration is now, so a key entered in the panel is used by the next
 * search without anybody restarting the API. The synchronous parts of the contract — the provider
 * id, its declared quota and capabilities — are answered from the adapter currently in hand.
 */
export class RuntimeMusicProvider implements MusicProvider {
  private readonly adapters: RuntimeAdapter<MusicSettings, MusicProvider>;

  constructor(
    private readonly settings: MusicSettingsSource,
    build: MusicAdapterFactory,
  ) {
    this.adapters = new RuntimeAdapter(settings.current().music, build, signatureOf);
  }

  get id(): MusicProviderId {
    return this.adapters.current.id;
  }

  get capabilities(): MusicProviderCapabilities {
    return this.adapters.current.capabilities;
  }

  get quota(): MusicProviderQuota {
    return this.adapters.current.quota;
  }

  async search(query: string, options: MusicSearchOptions): Promise<TrackSearchResult[]> {
    return (await this.active()).search(query, options);
  }

  async getTrack(providerTrackId: string): Promise<ProviderTrack | null> {
    return (await this.active()).getTrack(providerTrackId);
  }

  async getPlaybackSource(providerTrackId: string): Promise<PlaybackSource> {
    return (await this.active()).getPlaybackSource(providerTrackId);
  }

  private async active(): Promise<MusicProvider> {
    return this.adapters.for((await this.settings.effective()).music);
  }
}
