import type { Provider } from '@nestjs/common';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../application/ports';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { IyzicoPaymentProvider } from './iyzico-payment-provider';
import { MockPaymentProvider } from './mock-payment-provider';

export const createPaymentProvider = (config: AppConfig): PaymentProvider =>
  config.payment.provider === 'iyzico'
    ? new IyzicoPaymentProvider(config, (url, init) => fetch(url, init))
    : new MockPaymentProvider(config);

export const paymentProviderProvider: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [APP_CONFIG],
  useFactory: createPaymentProvider,
};
