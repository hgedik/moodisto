import { VenueUserRole } from '@moodisto/shared-types';
import type { SystemUserRecord, VenueUserRecord } from '../application/ports';
import { UnprocessableError } from '../common/errors';

/** The shape an account edit takes before it is written, expressed without any framework in the way. */
export interface AccountChange {
  readonly userId: string;
  readonly role: VenueUserRole;
  readonly active: boolean;
}

/**
 * The single spelling an account is stored and looked up under. Sign-in lowercases what is typed,
 * so an address saved with capitals would belong to somebody who could never reach it.
 */
export const normalizeAccountEmail = (email: string): string => email.trim().toLowerCase();

const isActiveOwner = (user: VenueUserRecord): boolean =>
  user.active && user.role === VenueUserRole.OWNER;

/**
 * Deactivation is the only exit an account has, which makes it the only way a venue can be left
 * with nobody able to administer it. An owner may step down or be switched off — but never the last
 * one still standing.
 */
export const assertVenueKeepsAnOwner = (
  users: readonly VenueUserRecord[],
  change: AccountChange,
): void => {
  const staysOwner = change.active && change.role === VenueUserRole.OWNER;
  if (staysOwner) {
    return;
  }

  const remaining = users.filter((user) => user.id !== change.userId).filter(isActiveOwner);
  if (remaining.length === 0) {
    throw new UnprocessableError(
      'Bu mekânın son aktif sahibi pasifleştirilemez veya rolü değiştirilemez. Önce başka bir sahip tanımlayın.',
      'LAST_VENUE_OWNER',
    );
  }
};

/** An operator switching off their own account would end the session that is doing the switching. */
export const assertOperatorNotLockingSelfOut = (
  actorId: string,
  targetId: string,
  nextActive: boolean,
): void => {
  if (actorId === targetId && !nextActive) {
    throw new UnprocessableError(
      'Kendi hesabınızı pasifleştiremezsiniz.',
      'OPERATOR_SELF_DEACTIVATION',
    );
  }
};

/** Nobody left to let anybody back in: the installation's last active operator stays active. */
export const assertLastOperatorStaysActive = (
  operators: readonly SystemUserRecord[],
  targetId: string,
): void => {
  const remaining = operators.filter((operator) => operator.id !== targetId && operator.active);
  if (remaining.length === 0) {
    throw new UnprocessableError(
      'Sistemdeki son aktif operatör pasifleştirilemez. Önce başka bir operatör tanımlayın.',
      'LAST_SYSTEM_OPERATOR',
    );
  }
};
