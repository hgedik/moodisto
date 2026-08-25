import { Prisma, type Track } from '@moodisto/database';
import { buildTrackSearchText } from '@moodisto/queue-engine';
import type { MusicProviderId } from '@moodisto/shared-types';
import type { TrackRecord, TrackRepository, TrackUpsertInput } from '../../application/ports';
import { toTrackRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaTrackRepository implements TrackRepository {
  constructor(private readonly tx: PrismaTx) {}

  /**
   * Search results are persisted so that creating a request only needs `(provider, trackId)`.
   * The browser therefore never dictates track metadata, and no extra provider quota is spent.
   *
   * The search text is rebuilt on every write rather than only on insert, so tracks stored before
   * the folding rule last changed catch up the next time anything touches them.
   */
  async upsertMany(tracks: readonly TrackUpsertInput[]): Promise<readonly TrackRecord[]> {
    const rows = [];
    for (const track of tracks) {
      const data = {
        title: track.title,
        artist: track.artist,
        channelName: track.channelName,
        channelId: track.channelId,
        thumbnailUrl: track.thumbnailUrl,
        durationSeconds: track.durationSeconds,
        searchText: buildTrackSearchText(track),
      };
      rows.push(
        await this.tx.track.upsert({
          where: {
            provider_providerTrackId: {
              provider: track.provider,
              providerTrackId: track.providerTrackId,
            },
          },
          update: data,
          create: { provider: track.provider, providerTrackId: track.providerTrackId, ...data },
        }),
      );
    }
    return rows.map(toTrackRecord);
  }

  /**
   * Substring matching on the folded search text, which the trigram index accelerates.
   *
   * Ranking is relevance first (how much of the row the query accounts for), then tracks that are
   * known to have played through, then the most recently proven ones. The last key only exists so
   * that two equally good matches always come back in the same order.
   */
  async searchCatalogue(input: {
    tokens: readonly string[];
    limit: number;
  }): Promise<readonly TrackRecord[]> {
    if (input.tokens.length === 0) {
      return [];
    }
    const conditions = Prisma.join(
      input.tokens.map((token) => Prisma.sql`"searchText" LIKE ${`%${token}%`}`),
      ' AND ',
    );
    const rows = await this.tx.$queryRaw<Track[]>`
      SELECT * FROM tracks
      WHERE "playbackBlockedAt" IS NULL AND (${conditions})
      ORDER BY similarity("searchText", ${input.tokens.join(' ')}) DESC,
               ("lastPlayedOkAt" IS NOT NULL) DESC,
               "lastPlayedOkAt" DESC NULLS LAST,
               title ASC
      LIMIT ${input.limit}
    `;
    return rows.map(toTrackRecord);
  }

  async findByProviderTrackId(
    provider: MusicProviderId,
    providerTrackId: string,
  ): Promise<TrackRecord | null> {
    const row = await this.tx.track.findUnique({
      where: { provider_providerTrackId: { provider, providerTrackId } },
    });
    return row ? toTrackRecord(row) : null;
  }

  async findById(trackId: string): Promise<TrackRecord | null> {
    const row = await this.tx.track.findUnique({ where: { id: trackId } });
    return row ? toTrackRecord(row) : null;
  }
}
