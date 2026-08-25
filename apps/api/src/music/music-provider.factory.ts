import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CachedMusicProvider,
  MusicProviderRegistry,
  YoutubeMusicProvider,
  type MusicProvider,
} from '@moodisto/music-provider';
import { MusicProviderId } from '@moodisto/shared-types';
import { SEARCH_CACHE_TTL_HOURS } from '@moodisto/validation';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { PrismaMusicSearchCache } from '../infrastructure/services/prisma-music-search-cache';
import { FakeMusicProvider } from './fake-music-provider';

export const MUSIC_PROVIDER = Symbol('MUSIC_PROVIDER');
export const MUSIC_PROVIDER_REGISTRY = Symbol('MUSIC_PROVIDER_REGISTRY');

/**
 * Builds the active provider: a concrete adapter, wrapped in the search cache decorator. The
 * YouTube API key is read here and never leaves the server — the browser only ever talks to
 * `/music/search`.
 */
@Injectable()
export class MusicProviderFactory {
  private readonly logger = new Logger(MusicProviderFactory.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly cache: PrismaMusicSearchCache,
  ) {}

  createRegistry(): MusicProviderRegistry {
    const registry = new MusicProviderRegistry();
    registry.register(this.createCached());
    return registry;
  }

  createCached(): MusicProvider {
    return new CachedMusicProvider(this.createBase(), this.cache, {
      ttlSeconds: SEARCH_CACHE_TTL_HOURS * 60 * 60,
    });
  }

  private createBase(): MusicProvider {
    if (this.config.music.useFakeProvider) {
      this.logger.warn(
        'MUSIC_PROVIDER_FAKE etkin: arama sonuçları sabit demo kataloğundan geliyor.',
      );
      return new FakeMusicProvider();
    }
    if (this.config.music.youtubeApiKey.length === 0) {
      this.logger.warn(
        'YOUTUBE_API_KEY tanımlı değil, demo katalog kullanılıyor. Üretimde bu yapılandırma reddedilir.',
      );
      return new FakeMusicProvider();
    }
    return new YoutubeMusicProvider({
      apiKey: this.config.music.youtubeApiKey,
      httpFetch: (url, init) => fetch(url, init),
      regionCode: this.config.music.youtubeRegionCode,
      relevanceLanguage: this.config.music.youtubeRelevanceLanguage,
    });
  }

  get activeProviderId(): MusicProviderId {
    return MusicProviderId.YOUTUBE;
  }
}
