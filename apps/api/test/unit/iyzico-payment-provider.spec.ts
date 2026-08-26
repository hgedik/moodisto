import { describe, expect, it, vi } from 'vitest';
import { PaymentStatus } from '@moodisto/shared-types';
import { ServiceUnavailableError, UnauthorizedError } from '../../src/common/errors';
import {
  IYZICO_SIGNATURE_HEADER,
  IyzicoPaymentProvider,
  toIyzicoPrice,
} from '../../src/payments/iyzico-payment-provider';
import { hmacSha256Hex } from '../../src/payments/signature';

const credentials = {
  apiKey: 'sandbox-api-key',
  secret: 'sandbox-secret',
  baseUrl: 'https://sandbox-api.iyzipay.com',
  webhookSecret: 'sandbox-webhook-secret',
};

const intent = {
  requestId: 'req-42',
  amountMinor: 2000,
  currency: 'TRY',
  description: 'Öncelikli istek: Dudu',
  returnUrl: 'http://localhost:3000/v/cafe-moda/request/req-42',
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('toIyzicoPrice', () => {
  it('renders integer minor units as a decimal string', () => {
    expect(toIyzicoPrice(2000)).toBe('20.00');
    expect(toIyzicoPrice(2050)).toBe('20.50');
    expect(toIyzicoPrice(5)).toBe('0.05');
  });
});

describe('IyzicoPaymentProvider.createSession', () => {
  it('signs the request with IYZWSv2 and returns the checkout form', async () => {
    const httpFetch = vi.fn(async () =>
      jsonResponse({
        status: 'success',
        token: 'iyz-token-1',
        paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/iyz-token-1',
        checkoutFormContent: '<script></script>',
        tokenExpireTime: 1800,
      }),
    );
    const provider = new IyzicoPaymentProvider(credentials, httpFetch as unknown as typeof fetch);

    const session = await provider.createSession(intent);

    expect(session.providerPaymentId).toBe('iyz-token-1');
    expect(session.status).toBe(PaymentStatus.PENDING);
    expect(session.checkoutUrl).toBe('https://sandbox-cpp.iyzipay.com/iyz-token-1');

    const [url, init] = httpFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${credentials.baseUrl}/payment/iyzipay/checkoutform/initialize/auth/ecom`);
    const headers = init.headers as Record<string, string>;
    const authorization = headers['authorization'] ?? '';
    expect(authorization.startsWith('IYZWSv2 ')).toBe(true);

    const decoded = Buffer.from(authorization.slice('IYZWSv2 '.length), 'base64').toString();
    const randomKey = headers['x-iyzi-rnd'];
    const uriPath = '/payment/iyzipay/checkoutform/initialize/auth/ecom';
    const expected = hmacSha256Hex(
      credentials.secret,
      `${randomKey}${uriPath}${init.body as string}`,
    );
    expect(decoded).toBe(
      `apiKey:${credentials.apiKey}&randomKey:${randomKey}&signature:${expected}`,
    );

    // Money crosses the boundary as a decimal string, but never as a float in our own model.
    const body = JSON.parse(init.body as string) as { price: string; paidPrice: string };
    expect(body.price).toBe('20.00');
    expect(body.paidPrice).toBe('20.00');
  });

  it('surfaces a provider level failure as a service error', async () => {
    const httpFetch = vi.fn(async () =>
      jsonResponse({ status: 'failure', errorMessage: 'Geçersiz istek' }),
    );
    const provider = new IyzicoPaymentProvider(credentials, httpFetch as unknown as typeof fetch);

    await expect(provider.createSession(intent)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('surfaces a network failure as a service error', async () => {
    const httpFetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const provider = new IyzicoPaymentProvider(credentials, httpFetch as unknown as typeof fetch);

    await expect(provider.createSession(intent)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe('IyzicoPaymentProvider.handleWebhook', () => {
  const provider = new IyzicoPaymentProvider(credentials);

  const notification = (status: string): { body: string; headers: Record<string, string> } => {
    const body = JSON.stringify({
      iyziEventType: 'CHECKOUT_FORM_AUTH',
      paymentId: '99001',
      token: 'iyz-token-1',
      paymentConversationId: 'req-42',
      status,
    });
    const signature = hmacSha256Hex(
      credentials.webhookSecret,
      `CHECKOUT_FORM_AUTH99001req-42${status}`,
    );
    return { body, headers: { [IYZICO_SIGNATURE_HEADER]: signature } };
  };

  it('accepts a valid v3 signature and reports the token as the payment id', async () => {
    const { body, headers } = notification('SUCCESS');
    const result = await provider.handleWebhook(body, headers);

    expect(result.providerPaymentId).toBe('iyz-token-1');
    expect(result.status).toBe(PaymentStatus.PAID);
  });

  it('treats any non success status as a failed payment', async () => {
    const { body, headers } = notification('FAILURE');
    const result = await provider.handleWebhook(body, headers);
    expect(result.status).toBe(PaymentStatus.FAILED);
  });

  it('rejects a notification with no signature at all', async () => {
    const { body } = notification('SUCCESS');
    await expect(provider.handleWebhook(body, {})).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a notification whose status was changed after signing', async () => {
    const { headers } = notification('FAILURE');
    const tampered = JSON.stringify({
      iyziEventType: 'CHECKOUT_FORM_AUTH',
      paymentId: '99001',
      token: 'iyz-token-1',
      paymentConversationId: 'req-42',
      status: 'SUCCESS',
    });
    await expect(provider.handleWebhook(tampered, headers)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
