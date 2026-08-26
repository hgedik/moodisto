import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@moodisto/shared-types';
import { UnauthorizedError, UnprocessableError } from '../../src/common/errors';
import {
  MOCK_PAYMENT_SIGNATURE_HEADER,
  MockPaymentProvider,
} from '../../src/payments/mock-payment-provider';
import { hmacSha256Hex } from '../../src/payments/signature';

const settings = { appUrl: 'http://localhost:3000', webhookSecret: 'mock-webhook-secret' };
const provider = new MockPaymentProvider(settings);

const signed = (body: string): Record<string, string> => ({
  [MOCK_PAYMENT_SIGNATURE_HEADER]: hmacSha256Hex(settings.webhookSecret, body),
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

  it('settles a correctly signed notification as paid', async () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'PAID' });
    const result = await provider.handleWebhook(body, signed(body));

    expect(result.providerPaymentId).toBe('mock_req-1');
    expect(result.status).toBe(PaymentStatus.PAID);
  });

  it('maps an explicit failure to a failed payment', async () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'FAILED' });
    const result = await provider.handleWebhook(body, signed(body));
    expect(result.status).toBe(PaymentStatus.FAILED);
  });

  it('rejects a notification with a forged signature', async () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'PAID' });
    await expect(
      provider.handleWebhook(body, { [MOCK_PAYMENT_SIGNATURE_HEADER]: 'nope' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a notification whose body was altered after signing', async () => {
    const original = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'FAILED' });
    const tampered = JSON.stringify({ providerPaymentId: 'mock_req-1', status: 'PAID' });
    await expect(provider.handleWebhook(tampered, signed(original))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects a signed notification that names no payment', async () => {
    const body = JSON.stringify({ status: 'PAID' });
    await expect(provider.handleWebhook(body, signed(body))).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });

  it('rejects a signed notification that is not json', async () => {
    await expect(provider.handleWebhook('not-json', signed('not-json'))).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });
});
