import { Injectable } from '@nestjs/common';
import type { MusicSearchCache, TrackSearchResult } from '@moodisto/music-provider';
import type { MusicProviderId } from '@moodisto/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Search results are cached in PostgreSQL for a day. This is the main lever against the provider's
 * daily quota: a busy venue searches the same handful of songs all night.
 */
@Injectable()
export class PrismaMusicSearchCache implements MusicSearchCache {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    provider: MusicProviderId,
    normalizedQuery: string,
  ): Promise<TrackSearchResult[] | null> {
    const row = await this.prisma.client.musicSearchCache.findUnique({
      where: { provider_normalizedQuery: { provider, normalizedQuery } },
    });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return row.resultJson as unknown as TrackSearchResult[];
  }

  async write(
    provider: MusicProviderId,
    normalizedQuery: string,
    results: readonly TrackSearchResult[],
    ttlSeconds: number,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const resultJson = results as unknown as object;
    await this.prisma.client.musicSearchCache.upsert({
      where: { provider_normalizedQuery: { provider, normalizedQuery } },
      update: { resultJson, expiresAt },
      create: { provider, normalizedQuery, resultJson, expiresAt },
    });
  }
}
