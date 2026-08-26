import type {
  CreateSystemUserInput,
  SystemUserRecord,
  SystemUserRepository,
  SystemUserUpdate,
} from '../../application/ports';
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

  async list(): Promise<readonly SystemUserRecord[]> {
    const rows = await this.tx.systemUser.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toSystemUserRecord);
  }

  async create(input: CreateSystemUserInput): Promise<SystemUserRecord> {
    const row = await this.tx.systemUser.create({ data: { ...input } });
    return toSystemUserRecord(row);
  }

  async update(userId: string, update: SystemUserUpdate): Promise<SystemUserRecord> {
    const row = await this.tx.systemUser.update({ where: { id: userId }, data: { ...update } });
    return toSystemUserRecord(row);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.tx.systemUser.update({ where: { id: userId }, data: { passwordHash } });
  }

  async markLoggedIn(userId: string, at: Date): Promise<void> {
    await this.tx.systemUser.update({ where: { id: userId }, data: { lastLoginAt: at } });
  }
}
