import { SetMetadata } from '@nestjs/common';
import type { VenueUserRole } from '@moodisto/shared-types';

export const REQUIRED_ROLES = 'moodisto:required-roles';

/** Restricts a route to the given venue roles. Without it any authenticated venue user passes. */
export const Roles = (...roles: readonly VenueUserRole[]) => SetMetadata(REQUIRED_ROLES, roles);
