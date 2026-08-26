import { describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { VenueUserRole } from '@moodisto/shared-types';
import { UnauthorizedError } from '../../src/common/errors';
import { SystemTokenService } from '../../src/auth/system-token.service';
import { VenueTokenService } from '../../src/auth/venue-token.service';
import { testAppConfig } from './support/app-config';

const config = testAppConfig();
const jwt = new JwtService({});
const systemTokens = new SystemTokenService(jwt, config);
const venueTokens = new VenueTokenService(jwt, config);

const systemUser = { id: 'system-1', email: 'system@example.com', name: 'Sistem' };

describe('SystemTokenService', () => {
  it('round-trips the system user claims', () => {
    expect(systemTokens.verify(systemTokens.sign(systemUser))).toEqual(systemUser);
  });

  it('refuses a venue session presented as a system session', () => {
    const venueToken = venueTokens.sign({
      id: 'user-1',
      venueId: 'venue-1',
      email: 'owner@example.com',
      name: 'Mekân Sahibi',
      role: VenueUserRole.OWNER,
    });

    expect(() => systemTokens.verify(venueToken)).toThrow(UnauthorizedError);
  });

  it('refuses a system session presented as a venue session', () => {
    expect(() => venueTokens.verify(systemTokens.sign(systemUser))).toThrow(UnauthorizedError);
  });

  it('refuses a token signed with another secret', () => {
    const foreign = new SystemTokenService(
      jwt,
      testAppConfig({ jwt: { ...config.jwt, secret: 'another-secret-at-least-16-chars' } }),
    );

    expect(() => systemTokens.verify(foreign.sign(systemUser))).toThrow(UnauthorizedError);
  });

  it('refuses nonsense', () => {
    expect(() => systemTokens.verify('not-a-token')).toThrow(UnauthorizedError);
  });
});
