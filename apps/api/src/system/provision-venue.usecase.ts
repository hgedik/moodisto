import { Inject, Injectable } from '@nestjs/common';
import { PlaybackState, VenueUserRole, type CreatedVenueDto } from '@moodisto/shared-types';
import type { CreateVenueInput } from '@moodisto/validation';
import {
  DATABASE,
  PASSWORD_HASHER,
  TOKEN_GENERATOR,
  type Database,
  type PasswordHasher,
  type TokenGenerator,
} from '../application/ports';
import { toQrCodeDto, toSystemVenueDto, toVenueUserDto } from '../application/dto-mappers';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { ConflictError } from '../common/errors';
import { normalizeAccountEmail } from './account-rules';
import { generateInitialPassword } from './initial-password';

const QR_TOKEN_BYTE_LENGTH = 24;

/**
 * Brings a café into the system in a single transaction.
 *
 * A venue is only useful once it has prices, a player to start, somebody who can sign in and a code
 * a guest can scan. Doing all of that at once means an operator never meets a venue that exists but
 * cannot be used — and a failure halfway through leaves no trace to clean up.
 */
@Injectable()
export class ProvisionVenueUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(input: CreateVenueInput): Promise<CreatedVenueDto> {
    const initialPassword = generateInitialPassword(this.tokens);
    // Hashing is deliberately outside the transaction: argon2id is slow by design and holding a
    // connection open for it would put every other write behind it.
    const passwordHash = await this.hasher.hash(initialPassword);
    const qrToken = this.tokens.generate(QR_TOKEN_BYTE_LENGTH);
    const email = normalizeAccountEmail(input.owner.email);

    return this.database.transaction(async (uow) => {
      const takenSlug = await uow.venues.findBySlug(input.slug);
      if (takenSlug) {
        throw new ConflictError('Bu adres başka bir mekân tarafından kullanılıyor.', 'SLUG_TAKEN');
      }

      const takenEmail = await uow.venueUsers.findByEmail(email);
      if (takenEmail) {
        throw new ConflictError('Bu e-posta zaten bir mekân hesabına ait.', 'EMAIL_TAKEN');
      }

      const venue = await uow.venues.create({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        address: input.address ?? null,
        logoUrl: input.logoUrl ?? null,
        timezone: input.timezone,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      });

      await uow.player.saveState({
        venueId: venue.id,
        state: PlaybackState.IDLE,
        queueItemId: null,
        startedAt: null,
      });

      const owner = await uow.venueUsers.create({
        venueId: venue.id,
        email,
        name: input.owner.name,
        role: VenueUserRole.OWNER,
        passwordHash,
      });

      const qrCode = await uow.qrCodes.create({
        venueId: venue.id,
        token: qrToken,
        tableLabel: input.firstTableLabel ?? null,
        expiresAt: null,
      });

      return {
        venue: toSystemVenueDto({ ...venue, userCount: 1 }),
        owner: toVenueUserDto(owner),
        qrCode: toQrCodeDto(qrCode, this.config.appUrl),
        initialPassword,
      };
    });
  }
}
