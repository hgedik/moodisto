import { Global, Module } from '@nestjs/common';
import type { MusicProvider, MusicProviderRegistry } from '@moodisto/music-provider';
import { PrismaMusicSearchCache } from '../infrastructure/services/prisma-music-search-cache';
import { MusicController } from './music.controller';
import {
  MUSIC_PROVIDER,
  MUSIC_PROVIDER_REGISTRY,
  MusicProviderFactory,
} from './music-provider.factory';
import { SearchMusicUseCase } from './search-music.usecase';

@Global()
@Module({
  controllers: [MusicController],
  providers: [
    PrismaMusicSearchCache,
    MusicProviderFactory,
    {
      provide: MUSIC_PROVIDER,
      useFactory: (factory: MusicProviderFactory): MusicProvider => factory.createCached(),
      inject: [MusicProviderFactory],
    },
    {
      provide: MUSIC_PROVIDER_REGISTRY,
      useFactory: (factory: MusicProviderFactory): MusicProviderRegistry =>
        factory.createRegistry(),
      inject: [MusicProviderFactory],
    },
    SearchMusicUseCase,
  ],
  exports: [MUSIC_PROVIDER, MUSIC_PROVIDER_REGISTRY, MusicProviderFactory],
})
export class MusicModule {}
