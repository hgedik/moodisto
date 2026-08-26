import type { Provider } from '@nestjs/common';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../application/ports';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { SystemSettingsService } from '../settings/system-settings.service';
import { IyzicoPaymentProvider } from './iyzico-payment-provider';
import { MockPaymentProvider } from './mock-payment-provider';
import { RuntimePaymentProvider, type PaymentSettings } from './runtime-payment-provider';

/**
 * Chooses the adapter the settings ask for. `appUrl` comes from the environment because the mock
 * checkout page is part of this deployment, not of the payment configuration.
 */
export const createPaymentAdapter = (appUrl: string, payment: PaymentSettings): PaymentProvider =>
  payment.provider === 'iyzico'
    ? new IyzicoPaymentProvider(
        {
          apiKey: payment.apiKey,
          secret: payment.secret,
          baseUrl: payment.baseUrl,
          webhookSecret: payment.webhookSecret,
        },
        (url, init) => fetch(url, init),
      )
    : new MockPaymentProvider({ appUrl, webhookSecret: payment.webhookSecret });

export const paymentProviderProvider: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [APP_CONFIG, SystemSettingsService],
  useFactory: (config: AppConfig, settings: SystemSettingsService): PaymentProvider =>
    new RuntimePaymentProvider(settings, (payment) => createPaymentAdapter(config.appUrl, payment)),
};
