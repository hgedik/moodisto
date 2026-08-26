import { Inject, Injectable } from '@nestjs/common';
import {
  type CreatedVenueUserDto,
  type PasswordResetDto,
  type VenueUserDto,
} from '@moodisto/shared-types';
import type { CreateVenueUserInput, UpdateVenueUserInput } from '@moodisto/validation';
import {
  DATABASE,
  PASSWORD_HASHER,
  TOKEN_GENERATOR,
  type Database,
  type PasswordHasher,
  type TokenGenerator,
  type UnitOfWork,
  type VenueUserRecord,
} from '../application/ports';
import { toVenueUserDto } from '../application/dto-mappers';
import { ConflictError, NotFoundError } from '../common/errors';
import { assertVenueKeepsAnOwner, normalizeAccountEmail } from './account-rules';
import { generateInitialPassword } from './initial-password';

/** The people who can open a venue's console: added, re-roled, switched off, never removed. */
@Injectable()
export class VenueUsersService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
  ) {}

  async list(venueId: string): Promise<readonly VenueUserDto[]> {
    const users = await this.database.read().venueUsers.listByVenue(venueId);
    return users.map(toVenueUserDto);
  }

  async create(venueId: string, input: CreateVenueUserInput): Promise<CreatedVenueUserDto> {
    const initialPassword = generateInitialPassword(this.tokens);
    const passwordHash = await this.hasher.hash(initialPassword);
    const email = normalizeAccountEmail(input.email);

    const user = await this.database.transaction(async (uow) => {
      const taken = await uow.venueUsers.findByEmail(email);
      if (taken) {
        throw new ConflictError('Bu e-posta zaten bir mekân hesabına ait.', 'EMAIL_TAKEN');
      }
      return uow.venueUsers.create({
        venueId,
        email,
        name: input.name,
        role: input.role,
        passwordHash,
      });
    });

    return { user: toVenueUserDto(user), initialPassword };
  }

  async update(
    venueId: string,
    userId: string,
    input: UpdateVenueUserInput,
  ): Promise<VenueUserDto> {
    const updated = await this.database.transaction(async (uow) => {
      await this.require(uow, venueId, userId);
      const staff = await uow.venueUsers.listByVenue(venueId);
      assertVenueKeepsAnOwner(staff, { userId, role: input.role, active: input.active });
      return uow.venueUsers.update(userId, {
        name: input.name,
        role: input.role,
        active: input.active,
      });
    });

    return toVenueUserDto(updated);
  }

  /** The old password stops working the moment the new one is shown, and it is shown only here. */
  async resetPassword(venueId: string, userId: string): Promise<PasswordResetDto> {
    const initialPassword = generateInitialPassword(this.tokens);
    const passwordHash = await this.hasher.hash(initialPassword);

    await this.database.transaction(async (uow) => {
      await this.require(uow, venueId, userId);
      await uow.venueUsers.updatePassword(userId, passwordHash);
    });

    return { initialPassword };
  }

  /** Reading the account through its venue is what stops one venue's console reaching another's staff. */
  private async require(
    uow: UnitOfWork,
    venueId: string,
    userId: string,
  ): Promise<VenueUserRecord> {
    const user = await uow.venueUsers.findById(userId);
    if (!user || user.venueId !== venueId) {
      throw new NotFoundError('Kullanıcı bulunamadı.', 'VENUE_USER_NOT_FOUND');
    }
    return user;
  }
}
