import type {
  PaymentIntent,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookResult,
} from '../application/ports';
import { RuntimeAdapter } from '../settings/runtime-adapter';
import type { EffectiveSettings } from '../settings/settings-resolver';

export type PaymentSettings = EffectiveSettings['payment'];

/** The slice of the settings service this provider needs, and nothing more. */
export interface PaymentSettingsSource {
  current(): { readonly payment: PaymentSettings };
  effective(): Promise<{ readonly payment: PaymentSettings }>;
}

export type PaymentAdapterFactory = (settings: PaymentSettings) => PaymentProvider;

const signatureOf = (settings: PaymentSettings): string =>
  [
    settings.provider,
    settings.apiKey,
    settings.secret,
    settings.baseUrl,
    settings.webhookSecret,
  ].join('|');

/**
 * Keeps the active payment adapter in step with the system settings, so a venue can move from the
 * mock provider to a real PSP — or rotate its credentials — without a deploy.
 *
 * The webhook secret is read at the moment a notification arrives, which is the only way a
 * rotation can take effect while money is in flight.
 */
export class RuntimePaymentProvider implements PaymentProvider {
  private readonly adapters: RuntimeAdapter<PaymentSettings, PaymentProvider>;

  constructor(
    private readonly settings: PaymentSettingsSource,
    build: PaymentAdapterFactory,
  ) {
    this.adapters = new RuntimeAdapter(settings.current().payment, build, signatureOf);
  }

  /** Stamped on every payment record, so it answers from the adapter currently in hand. */
  get id(): string {
    return this.adapters.current.id;
  }

  async createSession(intent: PaymentIntent): Promise<PaymentSession> {
    return (await this.active()).createSession(intent);
  }

  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<PaymentWebhookResult> {
    return (await this.active()).handleWebhook(rawBody, headers);
  }

  private async active(): Promise<PaymentProvider> {
    return this.adapters.for((await this.settings.effective()).payment);
  }
}
