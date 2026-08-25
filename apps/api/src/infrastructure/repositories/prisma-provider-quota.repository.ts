import { randomUUID } from 'node:crypto';
import { $Enums } from '@moodisto/database';
import type { MusicProviderId } from '@moodisto/shared-types';
import type { ProviderQuotaRepository } from '../../application/ports';
import type { PrismaTx } from '../prisma-types';

const toColumn = (provider: MusicProviderId): $Enums.MusicProvider =>
  provider as $Enums.MusicProvider;

export class PrismaProviderQuotaRepository implements ProviderQuotaRepository {
  constructor(private readonly tx: PrismaTx) {}

  async spentUnits(provider: MusicProviderId, periodKey: string): Promise<number> {
    const row = await this.tx.providerQuotaUsage.findUnique({
      where: { provider_periodKey: { provider: toColumn(provider), periodKey } },
    });
    return row?.spentUnits ?? 0;
  }

  /**
   * Checks and books in a single statement.
   *
   * The `WHERE` on the conflict branch is what makes it safe: two searches arriving at the same
   * moment cannot both read the same old total and spend the last of the allowance twice. A row
   * that does not exist yet trivially fits, since a single call never exceeds the ceiling on its
   * own — the caller refuses those before asking.
   */
  async tryConsume(input: {
    provider: MusicProviderId;
    periodKey: string;
    units: number;
    ceilingUnits: number;
  }): Promise<number | null> {
    if (input.units > input.ceilingUnits) {
      return null;
    }
    // Raw SQL bypasses Prisma's id default, so the id is generated here rather than by the
    // database — one less thing the schema has to promise.
    const rows = await this.tx.$queryRaw<{ spentUnits: number }[]>`
      INSERT INTO provider_quota_usage ("id", "provider", "periodKey", "spentUnits", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${toColumn(input.provider)}::"MusicProvider", ${input.periodKey}, ${input.units}, now(), now())
      ON CONFLICT ("provider", "periodKey") DO UPDATE
        SET "spentUnits" = provider_quota_usage."spentUnits" + ${input.units}, "updatedAt" = now()
        WHERE provider_quota_usage."spentUnits" + ${input.units} <= ${input.ceilingUnits}
      RETURNING "spentUnits"
    `;
    return rows[0]?.spentUnits ?? null;
  }
}
