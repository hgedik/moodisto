import type { MusicProviderId } from '@moodisto/shared-types';
import type { TrackRecord, TrackRepository, TrackUpsertInput } from '../../application/ports';
import { toTrackRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaTrackRepository implements TrackRepository {
  constructor(private readonly tx: PrismaTx) {}

  /**
   * Search results are persisted so that creating a request only needs `(provider, trackId)`.
   * The browser therefore never dictates track metadata, and no extra provider quota is spent.
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
