import { Inject, Injectable, Logger } from '@nestjs/common';
import { assertPaymentTransition, assertRequestTransition } from '@moodisto/queue-engine';
import { PaymentStatus, RequestStatus } from '@moodisto/shared-types';
import {
  CLOCK,
  DATABASE,
  PAYMENT_PROVIDER,
  type Clock,
  type Database,
  type PaymentProvider,
  type PaymentWebhookResult,
} from '../application/ports';
import { toSongRequestDto } from '../application/dto-mappers';
import {
  publishRequestCreated,
  publishRequestUpdated,
} from '../application/services/realtime-messages';
import { NotFoundError } from '../common/errors';

/**
 * The single door through which a payment may change state.
 *
 * Only a verified provider notification reaches this use case; the browser can report anything it
 * likes about a checkout and it will not move a request forward.
 */
@Injectable()
export class SettlePaymentUseCase {
  private readonly logger = new Logger(SettlePaymentUseCase.name);

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(result: PaymentWebhookResult): Promise<void> {
    const now = this.clock.now();

    await this.database.transaction(async (uow) => {
      const payment = await uow.payments.findByProviderPaymentId(
        this.provider.id,
        result.providerPaymentId,
      );
      if (!payment) {
        throw new NotFoundError('Ödeme kaydı bulunamadı.', 'PAYMENT_NOT_FOUND');
      }

      // Providers retry notifications; replaying a settled payment must be a no-op.
      if (payment.status === result.status) {
        this.logger.log(`Payment ${payment.id} already settled as ${payment.status}`);
        return;
      }
      assertPaymentTransition(payment.status, result.status);

      await uow.payments.updateStatus(payment.id, result.status, {
        providerPaymentId: result.providerPaymentId,
        paidAt: result.status === PaymentStatus.PAID ? now : undefined,
        rawPayload: result.rawPayload,
      });

      const request = await uow.songRequests.findById(payment.songRequestId);
      if (!request) {
        return;
      }

      const target =
        result.status === PaymentStatus.PAID ? RequestStatus.PENDING : RequestStatus.FAILED;
      assertRequestTransition(request.status, target);
      const updated = await uow.songRequests.applyStatusChange(request.id, { status: target });

      const dto = toSongRequestDto(updated);
      // A paid request reaches the venue console for the first time here, so it is announced as
      // a creation rather than an update.
      if (target === RequestStatus.PENDING) {
        publishRequestCreated(uow, dto);
      }
      publishRequestUpdated(uow, dto);
    });
  }
}
