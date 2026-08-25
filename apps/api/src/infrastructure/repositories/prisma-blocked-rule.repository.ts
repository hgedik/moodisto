import type { BlockedRuleType } from '@moodisto/shared-types';
import type { BlockedRuleRecord, BlockedRuleRepository } from '../../application/ports';
import { toBlockedRuleRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaBlockedRuleRepository implements BlockedRuleRepository {
  constructor(private readonly tx: PrismaTx) {}

  async listByVenue(venueId: string): Promise<readonly BlockedRuleRecord[]> {
    const rows = await this.tx.blockedMusicRule.findMany({
      where: { venueId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toBlockedRuleRecord);
  }

  async create(input: {
    venueId: string;
    type: BlockedRuleType;
    value: string;
  }): Promise<BlockedRuleRecord> {
    const row = await this.tx.blockedMusicRule.upsert({
      where: {
        venueId_type_value: { venueId: input.venueId, type: input.type, value: input.value },
      },
      update: {},
      create: input,
    });
    return toBlockedRuleRecord(row);
  }

  async remove(venueId: string, ruleId: string): Promise<boolean> {
    const result = await this.tx.blockedMusicRule.deleteMany({ where: { id: ruleId, venueId } });
    return result.count > 0;
  }
}
