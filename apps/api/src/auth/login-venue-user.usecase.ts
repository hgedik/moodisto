import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedVenueUserDto } from '@moodisto/shared-types';
import type { VenueLoginInput } from '@moodisto/validation';
import {
  DATABASE,
  PASSWORD_HASHER,
  type Database,
  type PasswordHasher,
} from '../application/ports';
import { toVenueSummaryDto } from '../application/dto-mappers';
import { UnauthorizedError } from '../common/errors';
import type { AuthenticatedVenueUser } from './authenticated-request';

export interface LoginResult {
  readonly user: AuthenticatedVenueUser;
  readonly dto: AuthenticatedVenueUserDto;
}

@Injectable()
export class LoginVenueUserUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: VenueLoginInput): Promise<LoginResult> {
    const uow = this.database.read();
    const account = await uow.venueUsers.findByEmail(input.email);

    // The same message and the same amount of work for both failure modes: a slow "no such user"
    // reply would leak which e-mail addresses exist.
    const invalid = new UnauthorizedError('E-posta veya şifre hatalı.', 'INVALID_CREDENTIALS');
    if (!account || !account.active) {
      await this.hasher.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
        input.password,
      );
      throw invalid;
    }

    const matches = await this.hasher.verify(account.passwordHash, input.password);
    if (!matches) {
      throw invalid;
    }

    // A closed venue closes its console too: staff of a deactivated venue have nothing to manage,
    // and the guest-facing pages have already stopped answering for it.
    const venue = await uow.venues.findById(account.venueId);
    if (!venue || !venue.active) {
      throw invalid;
    }

    const user: AuthenticatedVenueUser = {
      id: account.id,
      venueId: account.venueId,
      email: account.email,
      name: account.name,
      role: account.role,
    };

    return {
      user,
      dto: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        venue: toVenueSummaryDto(venue),
      },
    };
  }
}
