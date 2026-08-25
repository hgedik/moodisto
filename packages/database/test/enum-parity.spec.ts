import { describe, expect, it } from 'vitest';
import { $Enums } from '@prisma/client';
import {
  BlockedRuleType,
  MusicProviderId,
  PaymentStatus,
  PlaybackState,
  QueueItemState,
  RequestStatus,
  RequestType,
  VenueUserRole,
} from '@moodisto/shared-types';

/**
 * The Prisma schema and the shared domain enums are two declarations of the same vocabulary.
 * This test is what keeps them from drifting apart silently.
 */
const pairs: ReadonlyArray<readonly [string, Record<string, string>, Record<string, string>]> = [
  ['MusicProvider', $Enums.MusicProvider, MusicProviderId],
  ['RequestType', $Enums.RequestType, RequestType],
  ['RequestStatus', $Enums.RequestStatus, RequestStatus],
  ['QueueItemState', $Enums.QueueItemState, QueueItemState],
  ['PlaybackState', $Enums.PlaybackState, PlaybackState],
  ['PaymentStatus', $Enums.PaymentStatus, PaymentStatus],
  ['BlockedRuleType', $Enums.BlockedRuleType, BlockedRuleType],
  ['VenueUserRole', $Enums.VenueUserRole, VenueUserRole],
];

describe('prisma / shared-types enum parity', () => {
  it.each(pairs)('%s has identical values on both sides', (_name, prismaEnum, sharedEnum) => {
    expect(Object.values(prismaEnum).sort()).toEqual(Object.values(sharedEnum).sort());
  });
});
