import { Global, Module } from '@nestjs/common';
import { paymentProviderProvider } from './payment-provider.factory';
import { PaymentsController } from './payments.controller';
import { SettlePaymentUseCase } from './settle-payment.usecase';

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [paymentProviderProvider, SettlePaymentUseCase],
  exports: [paymentProviderProvider, SettlePaymentUseCase],
})
export class PaymentsModule {}
