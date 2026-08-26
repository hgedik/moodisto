import { PaymentStatus } from '@moodisto/shared-types';
import type {
  PaymentIntent,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookResult,
} from '../application/ports';
import { UnauthorizedError, UnprocessableError } from '../common/errors';
import { hmacSha256Hex, signaturesMatch } from './signature';

export const MOCK_PAYMENT_SIGNATURE_HEADER = 'x-moodisto-signature';

/** Everything the mock provider needs; deliberately not the whole application configuration. */
export interface MockPaymentSettings {
  /** Where the fake checkout page lives. */
  readonly appUrl: string;
  readonly webhookSecret: string;
}

interface MockWebhookBody {
  readonly providerPaymentId?: unknown;
  readonly status?: unknown;
}

/**
 * Development and end-to-end testing provider.
 *
 * It behaves like a real PSP in the only way that matters architecturally: money moves forward
 * exclusively through {@link handleWebhook}, never through anything the browser reports.
 */
export class MockPaymentProvider implements PaymentProvider {
  public readonly id = 'mock';

  public constructor(private readonly settings: MockPaymentSettings) {}

  public createSession(intent: PaymentIntent): Promise<PaymentSession> {
    const providerPaymentId = `mock_${intent.requestId}`;
    const checkoutUrl = new URL('/checkout/mock', this.settings.appUrl);
    checkoutUrl.searchParams.set('paymentId', providerPaymentId);
    checkoutUrl.searchParams.set('amountMinor', String(intent.amountMinor));
    checkoutUrl.searchParams.set('currency', intent.currency);
    checkoutUrl.searchParams.set('returnUrl', intent.returnUrl);

    return Promise.resolve({
      providerPaymentId,
      status: PaymentStatus.PENDING,
      checkoutUrl: checkoutUrl.toString(),
      checkoutFormContent: null,
      expiresAt: null,
    });
  }

  public async handleWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<PaymentWebhookResult> {
    const secret = this.settings.webhookSecret;
    if (secret.length > 0) {
      const received = headers[MOCK_PAYMENT_SIGNATURE_HEADER] ?? '';
      if (!signaturesMatch(hmacSha256Hex(secret, rawBody), received)) {
        throw new UnauthorizedError('Ödeme bildirimi doğrulanamadı.');
      }
    }

    const body = this.parse(rawBody);
    const providerPaymentId =
      typeof body.providerPaymentId === 'string' ? body.providerPaymentId : '';
    if (providerPaymentId.length === 0) {
      throw new UnprocessableError('Ödeme bildirimi eksik.', 'PAYMENT_WEBHOOK_INVALID');
    }

    return {
      providerPaymentId,
      status: body.status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.PAID,
      rawPayload: body,
    };
  }

  private parse(rawBody: string): MockWebhookBody {
    try {
      return JSON.parse(rawBody) as MockWebhookBody;
    } catch {
      throw new UnprocessableError('Ödeme bildirimi okunamadı.', 'PAYMENT_WEBHOOK_INVALID');
    }
  }
}
