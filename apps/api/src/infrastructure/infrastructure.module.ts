import { Global, Module } from '@nestjs/common';
import {
  CLOCK,
  PASSWORD_HASHER,
  RATE_LIMITER,
  SECRET_CIPHER,
  TOKEN_GENERATOR,
} from '../application/ports';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { AesSecretCipher } from './services/aes-secret-cipher';
import { Argon2PasswordHasher } from './services/argon2-password-hasher';
import { CryptoTokenGenerator } from './services/crypto-token-generator';
import { InMemoryRateLimiter } from './services/in-memory-rate-limiter';
import { SystemClock } from './services/system-clock';

/**
 * Binds the application's generic service ports to concrete adapters. It is global because these
 * ports are cross-cutting: every feature module depends on the abstraction, none on the class.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: TOKEN_GENERATOR, useClass: CryptoTokenGenerator },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: RATE_LIMITER, useClass: InMemoryRateLimiter },
    {
      provide: SECRET_CIPHER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new AesSecretCipher(config.settingsEncryptionKey),
    },
  ],
  exports: [CLOCK, TOKEN_GENERATOR, PASSWORD_HASHER, RATE_LIMITER, SECRET_CIPHER],
})
export class InfrastructureModule {}
