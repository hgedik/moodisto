import { Controller, Headers, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../application/ports';
import { SystemSettingsService } from '../settings/system-settings.service';
import { NotFoundError, UnprocessableError } from '../common/errors';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { SkipCsrf } from '../common/skip-csrf.decorator';
import { MOCK_PAYMENT_SIGNATURE_HEADER } from './mock-payment-provider';
import { hmacSha256Hex } from './signature';
import { SettlePaymentUseCase } from './settle-payment.usecase';

@Controller('payments')
@UseGuards(RateLimitGuard)
export class PaymentsController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly settings: SystemSettingsService,
    private readonly settle: SettlePaymentUseCase,
  ) {}

  /**
   * The provider's server-to-server notification. It carries no cookie, so CSRF does not apply;
   * its authenticity comes from the signature the adapter verifies over the raw body.
   */
  @Post('webhook')
  @SkipCsrf()
  @RateLimit({ bucket: 'payment-webhook', by: 'ip', limit: 120, windowSeconds: 60 })
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | undefined>,
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody?.toString('utf8') ?? '';
    if (rawBody.length === 0) {
      throw new UnprocessableError('Ödeme bildirimi boş.', 'PAYMENT_WEBHOOK_INVALID');
    }

    await this.settle.execute(await this.provider.handleWebhook(rawBody, headers));
    return { received: true };
  }

  /**
   * Development affordance: the mock checkout page settles through the same webhook path a real
   * PSP would use, signature included. Absent whenever a real provider is configured.
   */
  @Post('mock/settle')
  @SkipCsrf()
  @RateLimit({ bucket: 'payment-mock-settle', by: 'ip', limit: 60, windowSeconds: 60 })
  async settleMock(@Req() request: RawBodyRequest<Request>): Promise<{ received: true }> {
    const payment = (await this.settings.effective()).payment;
    if (payment.provider !== 'mock') {
      throw new NotFoundError('Bulunamadı.', 'NOT_FOUND');
    }

    const rawBody = request.rawBody?.toString('utf8') ?? '';
    const secret = payment.webhookSecret;
    const headers: Record<string, string | undefined> =
      secret.length > 0 ? { [MOCK_PAYMENT_SIGNATURE_HEADER]: hmacSha256Hex(secret, rawBody) } : {};

    await this.settle.execute(await this.provider.handleWebhook(rawBody, headers));
    return { received: true };
  }
}
