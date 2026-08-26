import type {
  CreateVenueUserInput,
  VenueUserRecord,
  VenueUserRepository,
  VenueUserUpdate,
} from '../../application/ports';
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

  async listByVenue(venueId: string): Promise<readonly VenueUserRecord[]> {
    const rows = await this.tx.venueUser.findMany({
      where: { venueId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toVenueUserRecord);
  }

  async create(input: CreateVenueUserInput): Promise<VenueUserRecord> {
    const row = await this.tx.venueUser.create({ data: { ...input } });
    return toVenueUserRecord(row);
  }

  async update(userId: string, update: VenueUserUpdate): Promise<VenueUserRecord> {
    const row = await this.tx.venueUser.update({ where: { id: userId }, data: { ...update } });
    return toVenueUserRecord(row);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.tx.venueUser.update({ where: { id: userId }, data: { passwordHash } });
  }
}
