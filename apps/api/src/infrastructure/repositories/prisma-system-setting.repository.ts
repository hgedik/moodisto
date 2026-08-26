import type {
  SystemSettingRecord,
  SystemSettingRepository,
  SystemSettingWriteInput,
} from '../../application/ports';
import { toSystemSettingRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaSystemSettingRepository implements SystemSettingRepository {
  constructor(private readonly tx: PrismaTx) {}

  async findAll(): Promise<readonly SystemSettingRecord[]> {
    const rows = await this.tx.systemSetting.findMany({ orderBy: { key: 'asc' } });
    return rows.map(toSystemSettingRecord);
  }

  async save(
    entries: readonly SystemSettingWriteInput[],
    updatedById: string | null,
  ): Promise<void> {
    for (const entry of entries) {
      const data = {
        valueText: entry.valueText,
        valueCipher: entry.valueCipher,
        secret: entry.secret,
        updatedById,
      };
      await this.tx.systemSetting.upsert({
        where: { key: entry.key },
        create: { key: entry.key, ...data },
        update: data,
      });
    }
  }

  async remove(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    await this.tx.systemSetting.deleteMany({ where: { key: { in: [...keys] } } });
  }
}
