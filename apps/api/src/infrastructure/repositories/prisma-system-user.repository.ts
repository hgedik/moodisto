import type { SystemUserRecord, SystemUserRepository } from '../../application/ports';
import { toSystemUserRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaSystemUserRepository implements SystemUserRepository {
  constructor(private readonly tx: PrismaTx) {}

  async findByEmail(email: string): Promise<SystemUserRecord | null> {
    const row = await this.tx.systemUser.findUnique({ where: { email } });
    return row ? toSystemUserRecord(row) : null;
  }

  async findById(userId: string): Promise<SystemUserRecord | null> {
    const row = await this.tx.systemUser.findUnique({ where: { id: userId } });
    return row ? toSystemUserRecord(row) : null;
  }

  async markLoggedIn(userId: string, at: Date): Promise<void> {
    await this.tx.systemUser.update({ where: { id: userId }, data: { lastLoginAt: at } });
  }
}
