import { Inject, Injectable } from '@nestjs/common';
import type { CreatedSystemUserDto, PasswordResetDto, SystemUserDto } from '@moodisto/shared-types';
import type { CreateSystemUserInput, UpdateSystemUserInput } from '@moodisto/validation';
import {
  DATABASE,
  PASSWORD_HASHER,
  TOKEN_GENERATOR,
  type Database,
  type PasswordHasher,
  type TokenGenerator,
} from '../application/ports';
import { toSystemUserDto } from '../application/dto-mappers';
import { ConflictError, NotFoundError } from '../common/errors';
import {
  assertLastOperatorStaysActive,
  assertOperatorNotLockingSelfOut,
  normalizeAccountEmail,
} from './account-rules';
import { generateInitialPassword } from './initial-password';

/** The operators of the installation itself. They belong to no venue and answer to each other. */
@Injectable()
export class SystemUsersService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
  ) {}

  async list(): Promise<readonly SystemUserDto[]> {
    const operators = await this.database.read().systemUsers.list();
    return operators.map(toSystemUserDto);
  }

  async create(input: CreateSystemUserInput): Promise<CreatedSystemUserDto> {
    const initialPassword = generateInitialPassword(this.tokens);
    const passwordHash = await this.hasher.hash(initialPassword);
    const email = normalizeAccountEmail(input.email);

    const operator = await this.database.transaction(async (uow) => {
      const taken = await uow.systemUsers.findByEmail(email);
      if (taken) {
        throw new ConflictError('Bu e-posta zaten bir operatör hesabına ait.', 'EMAIL_TAKEN');
      }
      return uow.systemUsers.create({ email, name: input.name, passwordHash });
    });

    return { user: toSystemUserDto(operator), initialPassword };
  }

  async update(
    actorId: string,
    userId: string,
    input: UpdateSystemUserInput,
  ): Promise<SystemUserDto> {
    assertOperatorNotLockingSelfOut(actorId, userId, input.active);

    const updated = await this.database.transaction(async (uow) => {
      await this.require(uow.systemUsers.findById(userId));
      if (!input.active) {
        assertLastOperatorStaysActive(await uow.systemUsers.list(), userId);
      }
      return uow.systemUsers.update(userId, { name: input.name, active: input.active });
    });

    return toSystemUserDto(updated);
  }

  async resetPassword(userId: string): Promise<PasswordResetDto> {
    const initialPassword = generateInitialPassword(this.tokens);
    const passwordHash = await this.hasher.hash(initialPassword);

    await this.database.transaction(async (uow) => {
      await this.require(uow.systemUsers.findById(userId));
      await uow.systemUsers.updatePassword(userId, passwordHash);
    });

    return { initialPassword };
  }

  private async require<T>(lookup: Promise<T | null>): Promise<T> {
    const found = await lookup;
    if (!found) {
      throw new NotFoundError('Operatör bulunamadı.', 'SYSTEM_USER_NOT_FOUND');
    }
    return found;
  }
}
