import { describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { VenueUserRole } from '@moodisto/shared-types';
import { UnauthorizedError } from '../../src/common/errors';
import { VenueTokenService } from '../../src/auth/venue-token.service';
import { testAppConfig } from './support/app-config';

const config = testAppConfig();
const service = new VenueTokenService(new JwtService({}), config);

const user = {
  id: 'user-1',
  venueId: 'venue-1',
  email: 'admin@example.com',
  name: 'Mekân Sahibi',
  role: VenueUserRole.OWNER,
};

describe('VenueTokenService', () => {
  it('round-trips the venue user claims', () => {
    expect(service.verify(service.sign(user))).toEqual(user);
  });

  it('rejects a token signed with another secret', () => {
    const foreign = new VenueTokenService(
      new JwtService({}),
      testAppConfig({ jwt: { ...config.jwt, secret: 'a-completely-different-secret' } }),
    );
    expect(() => service.verify(foreign.sign(user))).toThrow(UnauthorizedError);
  });

  it('rejects a tampered token', () => {
    const token = service.sign(user);
    expect(() => service.verify(`${token}x`)).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const shortLived = new VenueTokenService(
      new JwtService({}),
      testAppConfig({ jwt: { ...config.jwt, accessTtlSeconds: -1 } }),
    );
    expect(() => shortLived.verify(shortLived.sign(user))).toThrow(UnauthorizedError);
  });

  it('rejects a value that is not a token', () => {
    expect(() => service.verify('not-a-token')).toThrow(UnauthorizedError);
  });
});
