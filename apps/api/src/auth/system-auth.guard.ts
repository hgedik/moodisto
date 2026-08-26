import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { UnauthorizedError } from '../common/errors';
import { COOKIE_NAMES } from './cookies';
import type { MoodistoRequest } from './authenticated-request';
import { SystemTokenService } from './system-token.service';

/** Guards everything the operator can reach. A venue cookie is simply not a system session. */
@Injectable()
export class SystemAuthGuard implements CanActivate {
  constructor(private readonly tokens: SystemTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<MoodistoRequest>();
    const token = request.cookies?.[COOKIE_NAMES.systemSession];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedError();
    }

    request.systemUser = this.tokens.verify(token);
    return true;
  }
}
