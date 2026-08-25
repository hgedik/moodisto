import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@moodisto/shared-types';
import {
  InvalidStateTransitionError,
  assertPaymentTransition,
  canTransitionPayment,
} from '../src/payment/payment-state-machine';

describe('payment state machine', () => {
  it('settles a pending payment', () => {
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.PAID)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.FAILED)).toBe(true);
  });

  it('refunds only a paid payment', () => {
    expect(canTransitionPayment(PaymentStatus.PAID, PaymentStatus.REFUNDED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.REFUNDED)).toBe(false);
    expect(canTransitionPayment(PaymentStatus.FAILED, PaymentStatus.REFUNDED)).toBe(false);
  });

  it('refuses to revive a failed payment', () => {
    expect(canTransitionPayment(PaymentStatus.FAILED, PaymentStatus.PAID)).toBe(false);
  });

  it('ignores a duplicate webhook by refusing PAID -> PAID', () => {
    expect(canTransitionPayment(PaymentStatus.PAID, PaymentStatus.PAID)).toBe(false);
  });

  it('throws for an illegal transition', () => {
    expect(() => assertPaymentTransition(PaymentStatus.REFUNDED, PaymentStatus.PAID)).toThrow(
      InvalidStateTransitionError,
    );
  });
});
