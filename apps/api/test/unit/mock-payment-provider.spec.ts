import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@moodisto/shared-types';
import { UnauthorizedError, UnprocessableError } from '../../src/common/errors';
import {
  MOCK_PAYMENT_SIGNATURE_HEADER,
  MockPaymentProvider,
} from '../../src/payments/mock-payment-provider';
import { hmacSha256Hex } from '../../src/payments/signature';
import { testAppConfig } from './support/app-config';

const config = testAppConfig();
const provider = new MockPaymentProvider(config);

const signed = (body: string): Record<string, string> => ({
  [MOCK_PAYMENT_SIGNATURE_HEADER]: hmacSha256Hex(config.payment.webhookSecret, body),
});

describe('MockPaymentProvider', () => {
  it('builds a checkout url carrying the amount in minor units', async () => {
    const session = await provider.createSession({
      requestId: 'req-1',
      amountMinor: 2000,
      currency: 'TRY',
      description: 'Öncelikli istek',
      returnUrl: 'http://localhost:3000/v/cafe-moda/request/req-1',
    });

    const url = new URL(session.checkoutUrl as string);
    expect(url.pathname).toBe('/checkout/mock');
    expect(url.searchParams.get('amountMinor')).toBe('2000');
    expect(url.searchParams.get('currency')).toBe('TRY');
    expect(session.status).toBe(PaymentStatus.PENDING);
    expect(session.providerPaymentId).toBe('mock_req-1');
  });

  it('settles a correctly signed notification as paid', () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'PAID' });
    const result = provider.handleWebhook(body, signed(body));

    expect(result.providerPaymentId).toBe('mock_req-1');
    expect(result.status).toBe(PaymentStatus.PAID);
  });

  it('maps an explicit failure to a failed payment', () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'FAILED' });
    expect(provider.handleWebhook(body, signed(body)).status).toBe(PaymentStatus.FAILED);
  });

  it('rejects a notification with a forged signature', () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'PAID' });
    expect(() => provider.handleWebhook(body, { [MOCK_PAYMENT_SIGNATURE_HEADER]: 'nope' })).toThrow(
      UnauthorizedError,
    );
  });

  it('rejects a notification whose body was altered after signing', () => {
    const original = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'FAILED' });
    const tampered = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'PAID' });
    expect(() => provider.handleWebhook(tampered, signed(original))).toThrow(UnauthorizedError);
  });

  it('rejects a signed notification that names no payment', () => {
    const body = JSON.stringify({ status: 'PAID' });
    expect(() => provider.handleWebhook(body, signed(body))).toThrow(UnprocessableError);
  });

  it('rejects a signed notification that is not json', () => {
    expect(() => provider.handleWebhook('not-json', signed('not-json'))).toThrow(
      UnprocessableError,
    );
  });
});
