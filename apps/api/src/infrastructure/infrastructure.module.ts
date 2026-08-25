import { Global, Module } from '@nestjs/common';
import { CLOCK, PASSWORD_HASHER, RATE_LIMITER, TOKEN_GENERATOR } from '../application/ports';
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
  ],
  exports: [CLOCK, TOKEN_GENERATOR, PASSWORD_HASHER, RATE_LIMITER],
})
export class InfrastructureModule {}
