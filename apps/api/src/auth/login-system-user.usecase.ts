import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedSystemUserDto } from '@moodisto/shared-types';
import type { SystemLoginInput } from '@moodisto/validation';
import {
  CLOCK,
  DATABASE,
  PASSWORD_HASHER,
  type Clock,
  type Database,
  type PasswordHasher,
} from '../application/ports';
import { UnauthorizedError } from '../common/errors';
import type { AuthenticatedSystemUser } from './authenticated-request';

export interface SystemLoginResult {
  readonly user: AuthenticatedSystemUser;
  readonly dto: AuthenticatedSystemUserDto;
}

@Injectable()
export class LoginSystemUserUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SystemLoginInput): Promise<SystemLoginResult> {
    const account = await this.database.read().systemUsers.findByEmail(input.email);

    // The same message and the same amount of work for both failure modes: a fast "no such user"
    // reply would leak which accounts exist.
    const invalid = new UnauthorizedError('E-posta veya şifre hatalı.', 'INVALID_CREDENTIALS');
    if (!account || !account.active) {
      await this.hasher.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
        input.password,
      );
      throw invalid;
    }

    if (!(await this.hasher.verify(account.passwordHash, input.password))) {
      throw invalid;
    }

    const at = this.clock.now();
    await this.database.transaction(async (uow) => uow.systemUsers.markLoggedIn(account.id, at));

    const user: AuthenticatedSystemUser = {
      id: account.id,
      email: account.email,
      name: account.name,
    };
    return { user, dto: { ...user } };
  }
}
