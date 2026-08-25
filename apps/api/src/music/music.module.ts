import { Global, Module } from '@nestjs/common';
import type { MusicProvider, MusicProviderRegistry } from '@moodisto/music-provider';
import { PrismaMusicSearchCache } from '../infrastructure/services/prisma-music-search-cache';
import { MusicController } from './music.controller';
import {
  MUSIC_PROVIDER,
  MUSIC_PROVIDER_REGISTRY,
  MusicProviderFactory,
} from './music-provider.factory';
import { ProviderQuotaService } from './provider-quota.service';
import { SearchCatalogueUseCase } from './search-catalogue.usecase';
import { SearchProviderUseCase } from './search-provider.usecase';

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
    ProviderQuotaService,
    SearchCatalogueUseCase,
    SearchProviderUseCase,
  ],
  exports: [MUSIC_PROVIDER, MUSIC_PROVIDER_REGISTRY, MusicProviderFactory, ProviderQuotaService],
})
export class MusicModule {}
