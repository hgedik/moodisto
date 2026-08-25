import type { VenueQrCodeRecord, VenueQrCodeRepository } from '../../application/ports';
import { toQrCodeRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaVenueQrCodeRepository implements VenueQrCodeRepository {
  constructor(private readonly tx: PrismaTx) {}

  async findByToken(token: string): Promise<VenueQrCodeRecord | null> {
    const row = await this.tx.venueQrCode.findUnique({ where: { token } });
    return row ? toQrCodeRecord(row) : null;
  }

  async listByVenue(venueId: string): Promise<readonly VenueQrCodeRecord[]> {
    const rows = await this.tx.venueQrCode.findMany({
      where: { venueId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toQrCodeRecord);
  }

  async create(input: {
    venueId: string;
    token: string;
    tableLabel: string | null;
    expiresAt: Date | null;
  }): Promise<VenueQrCodeRecord> {
    const row = await this.tx.venueQrCode.create({ data: input });
    return toQrCodeRecord(row);
  }

  async deactivate(venueId: string, qrCodeId: string): Promise<VenueQrCodeRecord | null> {
    const result = await this.tx.venueQrCode.updateMany({
      where: { id: qrCodeId, venueId },
      data: { active: false },
    });
    if (result.count === 0) {
      return null;
    }
    const row = await this.tx.venueQrCode.findUnique({ where: { id: qrCodeId } });
    return row ? toQrCodeRecord(row) : null;
  }
}
