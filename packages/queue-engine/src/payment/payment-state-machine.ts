import { PaymentStatus } from '@moodisto/shared-types';
import { InvalidStateTransitionError } from '../errors';

export { InvalidStateTransitionError };

const ALLOWED_PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> =
  Object.freeze({
    [PaymentStatus.PENDING]: [PaymentStatus.PAID, PaymentStatus.FAILED],
    [PaymentStatus.PAID]: [PaymentStatus.REFUNDED],
    [PaymentStatus.FAILED]: [],
    [PaymentStatus.REFUNDED]: [],
  });

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidStateTransitionError('Payment', from, to);
  }
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return ALLOWED_PAYMENT_TRANSITIONS[status].length === 0;
}
