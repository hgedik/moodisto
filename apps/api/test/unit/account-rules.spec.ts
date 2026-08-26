import { describe, expect, it } from 'vitest';
import { VenueUserRole } from '@moodisto/shared-types';
import type { SystemUserRecord, VenueUserRecord } from '../../src/application/ports';
import {
  assertLastOperatorStaysActive,
  normalizeAccountEmail,
  assertOperatorNotLockingSelfOut,
  assertVenueKeepsAnOwner,
} from '../../src/system/account-rules';
import { UnprocessableError } from '../../src/common/errors';

const venueUser = (overrides: Partial<VenueUserRecord> & { id: string }): VenueUserRecord => ({
  venueId: 'venue-1',
  email: `${overrides.id}@moodisto.test`,
  name: overrides.id,
  passwordHash: 'hash',
  role: VenueUserRole.OWNER,
  active: true,
  ...overrides,
});

const operator = (overrides: Partial<SystemUserRecord> & { id: string }): SystemUserRecord => ({
  email: `${overrides.id}@moodisto.test`,
  name: overrides.id,
  passwordHash: 'hash',
  active: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

/**
 * Deactivation is the only way an account leaves the system, which makes it the only way an
 * installation can be locked out of itself. These rules are what stands between an operator and a
 * venue nobody can administer any more.
 */
describe('assertVenueKeepsAnOwner', () => {
  it('lets a manager be deactivated while an owner remains', () => {
    const users = [venueUser({ id: 'owner' }), venueUser({ id: 'dj', role: VenueUserRole.DJ })];

    expect(() =>
      assertVenueKeepsAnOwner(users, { userId: 'dj', role: VenueUserRole.DJ, active: false }),
    ).not.toThrow();
  });

  it('refuses to deactivate the last active owner', () => {
    const users = [venueUser({ id: 'owner' }), venueUser({ id: 'dj', role: VenueUserRole.DJ })];

    expect(() =>
      assertVenueKeepsAnOwner(users, { userId: 'owner', role: VenueUserRole.OWNER, active: false }),
    ).toThrow(UnprocessableError);
  });

  it('refuses to demote the last active owner', () => {
    const users = [venueUser({ id: 'owner' })];

    expect(() =>
      assertVenueKeepsAnOwner(users, {
        userId: 'owner',
        role: VenueUserRole.MANAGER,
        active: true,
      }),
    ).toThrow(UnprocessableError);
  });

  it('allows demoting an owner when another active owner stays behind', () => {
    const users = [venueUser({ id: 'owner' }), venueUser({ id: 'second-owner' })];

    expect(() =>
      assertVenueKeepsAnOwner(users, {
        userId: 'owner',
        role: VenueUserRole.MANAGER,
        active: true,
      }),
    ).not.toThrow();
  });

  it('ignores owners who are already deactivated', () => {
    const users = [venueUser({ id: 'owner' }), venueUser({ id: 'retired', active: false })];

    expect(() =>
      assertVenueKeepsAnOwner(users, { userId: 'owner', role: VenueUserRole.OWNER, active: false }),
    ).toThrow(UnprocessableError);
  });
});

describe('assertOperatorNotLockingSelfOut', () => {
  it('lets an operator deactivate somebody else', () => {
    expect(() => assertOperatorNotLockingSelfOut('me', 'other', false)).not.toThrow();
  });

  it('lets an operator edit their own still-active account', () => {
    expect(() => assertOperatorNotLockingSelfOut('me', 'me', true)).not.toThrow();
  });

  it('refuses to let an operator deactivate themselves', () => {
    expect(() => assertOperatorNotLockingSelfOut('me', 'me', false)).toThrow(UnprocessableError);
  });
});

describe('assertLastOperatorStaysActive', () => {
  it('allows a deactivation while another operator remains active', () => {
    const operators = [operator({ id: 'first' }), operator({ id: 'second' })];

    expect(() => assertLastOperatorStaysActive(operators, 'first')).not.toThrow();
  });

  it('refuses to deactivate the installation’s last active operator', () => {
    const operators = [operator({ id: 'first' }), operator({ id: 'retired', active: false })];

    expect(() => assertLastOperatorStaysActive(operators, 'first')).toThrow(UnprocessableError);
  });
});

describe('normalizeAccountEmail', () => {
  it('stores an address the way sign-in will look it up', () => {
    expect(normalizeAccountEmail('  Deniz@Yeni-Kafe.TEST ')).toBe('deniz@yeni-kafe.test');
  });
});
