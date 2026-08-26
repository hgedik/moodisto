import { randomBytes } from 'node:crypto';
import { PaymentStatus } from '@moodisto/shared-types';
import type {
  PaymentIntent,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookResult,
} from '../application/ports';
import { ServiceUnavailableError, UnauthorizedError, UnprocessableError } from '../common/errors';
import { hmacSha256Hex, signaturesMatch } from './signature';

export const IYZICO_SIGNATURE_HEADER = 'x-iyz-signature-v3';

const CHECKOUT_FORM_PATH = '/payment/iyzipay/checkoutform/initialize/auth/ecom';

interface CheckoutFormResponse {
  readonly status?: string;
  readonly errorMessage?: string;
  readonly token?: string;
  readonly checkoutFormContent?: string;
  readonly paymentPageUrl?: string;
  readonly tokenExpireTime?: number;
}

/** The credentials the adapter signs with; read from the system settings on every rebuild. */
export interface IyzicoCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly baseUrl: string;
  readonly webhookSecret: string;
}

interface IyzicoWebhookBody {
  readonly iyziEventType?: unknown;
  readonly paymentId?: unknown;
  readonly token?: unknown;
  readonly paymentConversationId?: unknown;
  readonly status?: unknown;
}

/** iyzico prices are decimal strings; Moodisto stores integer minor units. */
export const toIyzicoPrice = (amountMinor: number): string => (amountMinor / 100).toFixed(2);

/**
 * iyzico Checkout Form adapter.
 *
 * The adapter is the only place that knows iyzico exists: swapping PSPs means writing another
 * {@link PaymentProvider} and changing one environment variable.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  public readonly id = 'iyzico';

  public constructor(
    private readonly credentials: IyzicoCredentials,
    private readonly httpFetch: typeof fetch = fetch,
  ) {}

  public async createSession(intent: PaymentIntent): Promise<PaymentSession> {
    const price = toIyzicoPrice(intent.amountMinor);
    const body = JSON.stringify({
      locale: 'tr',
      conversationId: intent.requestId,
      price,
      paidPrice: price,
      currency: intent.currency,
      basketId: intent.requestId,
      paymentGroup: 'PRODUCT',
      callbackUrl: intent.returnUrl,
      // iyzico requires buyer and address fields. Moodisto keeps guests anonymous, so the venue
      // itself is sent as the payer of record; no personal data is collected to satisfy the API.
      buyer: {
        id: intent.requestId,
        name: 'Moodisto',
        surname: 'Misafir',
        identityNumber: '11111111111',
        email: 'guest@moodisto.app',
        registrationAddress: 'Moodisto',
        city: 'Istanbul',
        country: 'Turkey',
        ip: '0.0.0.0',
      },
      billingAddress: {
        contactName: 'Moodisto Misafir',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Moodisto',
      },
      basketItems: [
        {
          id: intent.requestId,
          name: intent.description.slice(0, 120),
          category1: 'Muzik',
          itemType: 'VIRTUAL',
          price,
        },
      ],
    });

    const response = await this.post(CHECKOUT_FORM_PATH, body);
    if (response.status !== 'success' || typeof response.token !== 'string') {
      throw new ServiceUnavailableError(
        response.errorMessage ?? 'Ödeme oturumu başlatılamadı.',
        'PAYMENT_SESSION_FAILED',
      );
    }

    return {
      providerPaymentId: response.token,
      status: PaymentStatus.PENDING,
      checkoutUrl: response.paymentPageUrl ?? null,
      checkoutFormContent: response.checkoutFormContent ?? null,
      expiresAt:
        typeof response.tokenExpireTime === 'number'
          ? new Date(Date.now() + response.tokenExpireTime * 1000)
          : null,
    };
  }

  /**
   * Verifies iyzico's v3 webhook signature: an HMAC-SHA256, keyed with the secret, over the
   * concatenated event fields. An unverified notification never moves a request forward.
   */
  public async handleWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<PaymentWebhookResult> {
    const body = this.parse(rawBody);
    const paymentId = this.readString(body.paymentId);
    const token = this.readString(body.token);
    const providerPaymentId = token.length > 0 ? token : paymentId;
    if (providerPaymentId.length === 0) {
      throw new UnprocessableError('Ödeme bildirimi eksik.', 'PAYMENT_WEBHOOK_INVALID');
    }

    const secret = this.credentials.webhookSecret || this.credentials.secret;
    const signatureBase = [
      this.readString(body.iyziEventType),
      paymentId,
      this.readString(body.paymentConversationId),
      this.readString(body.status),
    ].join('');
    const received = headers[IYZICO_SIGNATURE_HEADER] ?? '';
    if (!signaturesMatch(hmacSha256Hex(secret, signatureBase), received)) {
      throw new UnauthorizedError('Ödeme bildirimi doğrulanamadı.');
    }

    return {
      providerPaymentId,
      status:
        this.readString(body.status) === 'SUCCESS' ? PaymentStatus.PAID : PaymentStatus.FAILED,
      rawPayload: body,
    };
  }

  /** iyzico's IYZWSv2 authentication: HMAC-SHA256 over randomKey + uri path + request body. */
  private authorizationHeader(uriPath: string, body: string, randomKey: string): string {
    const signature = hmacSha256Hex(this.credentials.secret, `${randomKey}${uriPath}${body}`);
    const params = `apiKey:${this.credentials.apiKey}&randomKey:${randomKey}&signature:${signature}`;
    return `IYZWSv2 ${Buffer.from(params, 'utf8').toString('base64')}`;
  }

  private async post(uriPath: string, body: string): Promise<CheckoutFormResponse> {
    const randomKey = `${Date.now()}${randomBytes(6).toString('hex')}`;

    let response: Response;
    try {
      response = await this.httpFetch(`${this.credentials.baseUrl}${uriPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-iyzi-rnd': randomKey,
          authorization: this.authorizationHeader(uriPath, body, randomKey),
        },
        body,
      });
    } catch {
      throw new ServiceUnavailableError('Ödeme sağlayıcısına ulaşılamadı.', 'PAYMENT_UNAVAILABLE');
    }

    if (!response.ok) {
      throw new ServiceUnavailableError('Ödeme sağlayıcısı hata döndü.', 'PAYMENT_UNAVAILABLE');
    }
    return (await response.json()) as CheckoutFormResponse;
  }

  private parse(rawBody: string): IyzicoWebhookBody {
    try {
      return JSON.parse(rawBody) as IyzicoWebhookBody;
    } catch {
      throw new UnprocessableError('Ödeme bildirimi okunamadı.', 'PAYMENT_WEBHOOK_INVALID');
    }
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
