import type { CustomerSessionRecord, CustomerSessionRepository } from '../../application/ports';
import { toCustomerSessionRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaCustomerSessionRepository implements CustomerSessionRepository {
  constructor(private readonly tx: PrismaTx) {}

  async findByToken(sessionToken: string): Promise<CustomerSessionRecord | null> {
    const row = await this.tx.customerSession.findUnique({ where: { sessionToken } });
    return row ? toCustomerSessionRecord(row) : null;
  }

  async create(input: {
    sessionToken: string;
    venueId: string | null;
    tableLabel: string | null;
  }): Promise<CustomerSessionRecord> {
    const row = await this.tx.customerSession.create({ data: input });
    return toCustomerSessionRecord(row);
  }

  async attachToVenue(
    sessionId: string,
    venueId: string,
    tableLabel: string | null,
  ): Promise<CustomerSessionRecord> {
    const row = await this.tx.customerSession.update({
      where: { id: sessionId },
      data: { venueId, tableLabel, lastSeenAt: new Date() },
    });
    return toCustomerSessionRecord(row);
  }
}
