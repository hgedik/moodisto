import { type Prisma } from '@moodisto/database';
import type { PaymentStatus } from '@moodisto/shared-types';
import type { CreatePaymentInput, PaymentRecord, PaymentRepository } from '../../application/ports';
import { toPaymentRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly tx: PrismaTx) {}

  async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    const row = await this.tx.payment.create({
      data: {
        songRequestId: input.songRequestId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        metadata: input.checkoutUrl ? { checkoutUrl: input.checkoutUrl } : {},
      },
    });
    return toPaymentRecord(row);
  }

  async findById(paymentId: string): Promise<PaymentRecord | null> {
    const row = await this.tx.payment.findUnique({ where: { id: paymentId } });
    return row ? toPaymentRecord(row) : null;
  }

  async findByProviderPaymentId(
    provider: string,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null> {
    const row = await this.tx.payment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId } },
    });
    return row ? toPaymentRecord(row) : null;
  }

  async updateStatus(
    paymentId: string,
    status: PaymentStatus,
    input?: { providerPaymentId?: string; paidAt?: Date; rawPayload?: unknown },
  ): Promise<PaymentRecord> {
    const existing = await this.tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const metadata: Prisma.InputJsonValue = {
      ...(typeof existing.metadata === 'object' && existing.metadata !== null
        ? (existing.metadata as Record<string, unknown>)
        : {}),
      ...(input?.rawPayload === undefined
        ? {}
        : { lastWebhookPayload: input.rawPayload as Prisma.InputJsonValue }),
    };

    const row = await this.tx.payment.update({
      where: { id: paymentId },
      data: {
        status,
        metadata,
        ...(input?.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
        ...(input?.paidAt ? { paidAt: input.paidAt } : {}),
        ...(status === 'REFUNDED' ? { refundedAt: new Date() } : {}),
      },
    });
    return toPaymentRecord(row);
  }
}
