import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMITER, type RateLimiter } from '../application/ports';
import { SystemSettingsService } from '../settings/system-settings.service';
import { TooManyRequestsError } from './errors';
import { RATE_LIMIT_RULES, type RateLimitRule } from './rate-limit.decorator';
import type { MoodistoRequest } from '../auth/authenticated-request';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly settings: SystemSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const rules = this.reflector.getAllAndOverride<readonly RateLimitRule[] | undefined>(
      RATE_LIMIT_RULES,
      [context.getHandler(), context.getClass()],
    );
    if (!rules || rules.length === 0) {
      return true;
    }
    // Asked per request so the switch in the system panel takes effect without a restart.
    if (!(await this.settings.effective()).features.rateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MoodistoRequest>();
    for (const rule of rules) {
      const subject = rule.by === 'customer' ? (request.customer?.id ?? request.ip) : request.ip;
      const decision = await this.limiter.consume(
        `${rule.bucket}:${rule.by}:${subject ?? 'unknown'}`,
        rule.limit,
        rule.windowSeconds,
      );
      if (!decision.allowed) {
        throw new TooManyRequestsError(
          rule.message ?? 'Çok fazla istek gönderdiniz, lütfen biraz bekleyin.',
          decision.retryAfterSeconds,
        );
      }
    }
    return true;
  }
}
