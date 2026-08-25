import type { VenueUserRole } from '@moodisto/shared-types';
import type { Request } from 'express';

export interface AuthenticatedVenueUser {
  readonly id: string;
  readonly venueId: string;
  readonly email: string;
  readonly name: string;
  readonly role: VenueUserRole;
}

export interface CustomerIdentity {
  readonly id: string;
  readonly sessionToken: string;
  readonly venueId: string | null;
  readonly tableLabel: string | null;
}

export interface MoodistoRequest extends Request {
  venueUser?: AuthenticatedVenueUser;
  customer?: CustomerIdentity;
}
