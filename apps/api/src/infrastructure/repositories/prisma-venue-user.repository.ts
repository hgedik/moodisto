import type { VenueUserRecord, VenueUserRepository } from '../../application/ports';
import { toVenueUserRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaVenueUserRepository implements VenueUserRepository {
  constructor(private readonly tx: PrismaTx) {}

  async findByEmail(email: string): Promise<VenueUserRecord | null> {
    const row = await this.tx.venueUser.findUnique({ where: { email } });
    return row ? toVenueUserRecord(row) : null;
  }

  async findById(userId: string): Promise<VenueUserRecord | null> {
    const row = await this.tx.venueUser.findUnique({ where: { id: userId } });
    return row ? toVenueUserRecord(row) : null;
  }
}
