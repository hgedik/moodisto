import { Body, Controller, Get, Inject, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedSystemUserDto } from '@moodisto/shared-types';
import { systemLoginSchema, type SystemLoginInput } from '@moodisto/validation';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { RateLimit } from '../common/rate-limit.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { authCookieOptions, clearCookie, COOKIE_NAMES } from './cookies';
import { CurrentSystemUser } from './current-user.decorator';
import type { AuthenticatedSystemUser } from './authenticated-request';
import { LoginSystemUserUseCase } from './login-system-user.usecase';
import { SystemAuthGuard } from './system-auth.guard';
import { SystemTokenService } from './system-token.service';

/** The guard is class-wide so that `@RateLimit` on the login route is actually enforced. */
@Controller('auth/system')
@UseGuards(RateLimitGuard)
export class SystemAuthController {
  constructor(
    private readonly login: LoginSystemUserUseCase,
    private readonly tokens: SystemTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  @RateLimit({ bucket: 'system-login', by: 'ip', limit: 10, windowSeconds: 300 })
  async systemLogin(
    @Body(zodBody(systemLoginSchema)) body: SystemLoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedSystemUserDto> {
    const result = await this.login.execute(body);
    response.cookie(
      COOKIE_NAMES.systemSession,
      this.tokens.sign(result.user),
      authCookieOptions(this.config.isProduction, this.config.jwt.accessTtlSeconds),
    );
    return result.dto;
  }

  @Post('logout')
  @UseGuards(SystemAuthGuard)
  systemLogout(@Res({ passthrough: true }) response: Response): { ok: true } {
    clearCookie(response, COOKIE_NAMES.systemSession, this.config.isProduction);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SystemAuthGuard)
  me(@CurrentSystemUser() user: AuthenticatedSystemUser): AuthenticatedSystemUserDto {
    return { id: user.id, email: user.email, name: user.name };
  }
}
