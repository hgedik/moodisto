import { Injectable, Logger } from '@nestjs/common';
import {
  CachedMusicProvider,
  MusicProviderRegistry,
  YoutubeMusicProvider,
  type MusicProvider,
} from '@moodisto/music-provider';
import { MusicProviderId } from '@moodisto/shared-types';
import { SEARCH_CACHE_TTL_HOURS } from '@moodisto/validation';
import { PrismaMusicSearchCache } from '../infrastructure/services/prisma-music-search-cache';
import { SystemSettingsService } from '../settings/system-settings.service';
import { FakeMusicProvider } from './fake-music-provider';
import { RuntimeMusicProvider, type MusicSettings } from './runtime-music-provider';

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
export const MUSIC_PROVIDER_REGISTRY = Symbol('MUSIC_PROVIDER_REGISTRY');

/**
 * Builds the active provider: the concrete adapter the settings ask for, kept current by
 * {@link RuntimeMusicProvider} and wrapped in the search cache decorator. The YouTube API key is
 * read here and never leaves the server — the browser only ever talks to `/music/search`.
 */
@Injectable()
export class MusicProviderFactory {
  private readonly logger = new Logger(MusicProviderFactory.name);

  constructor(
    private readonly settings: SystemSettingsService,
    private readonly cache: PrismaMusicSearchCache,
  ) {}

  createRegistry(): MusicProviderRegistry {
    const registry = new MusicProviderRegistry();
    registry.register(this.createCached());
    return registry;
  }

  createCached(): MusicProvider {
    const runtime = new RuntimeMusicProvider(this.settings, (music) => this.createBase(music));
    return new CachedMusicProvider(runtime, this.cache, {
      ttlSeconds: SEARCH_CACHE_TTL_HOURS * 60 * 60,
    });
  }

  private createBase(music: MusicSettings): MusicProvider {
    if (music.useFakeProvider) {
      this.logger.warn(
        'MUSIC_PROVIDER_FAKE etkin: arama sonuçları sabit demo kataloğundan geliyor.',
      );
      return new FakeMusicProvider();
    }
    if (music.youtubeApiKey.length === 0) {
      this.logger.warn(
        'YouTube API anahtarı tanımlı değil, demo katalog kullanılıyor. Anahtarı sistem panelinden girebilirsiniz.',
      );
      return new FakeMusicProvider();
    }
    return new YoutubeMusicProvider({
      apiKey: music.youtubeApiKey,
      httpFetch: (url, init) => fetch(url, init),
      regionCode: music.youtubeRegionCode,
      relevanceLanguage: music.youtubeRelevanceLanguage,
    });
  }

  get activeProviderId(): MusicProviderId {
    return MusicProviderId.YOUTUBE;
  }
}
