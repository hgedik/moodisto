import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { $Enums, type PrismaClient } from '@moodisto/database';

export const VENUE_PASSWORD = 'moodisto-test-2026';

export interface VenueFixture {
  readonly venueId: string;
  readonly slug: string;
  readonly ownerEmail: string;
  readonly djEmail: string;
  readonly qrToken: string;
  readonly tableLabel: string;
}

let passwordHash: string | null = null;

/** Hashing is deliberately expensive, so the suite pays for it once. */
const hashOnce = async (): Promise<string> => {
  passwordHash ??= await argon2.hash(VENUE_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return passwordHash;
};

export const createVenueFixture = async (
  prisma: PrismaClient,
  overrides: { slug?: string; playNextPriceMinor?: number; duplicateCooldownMinutes?: number } = {},
): Promise<VenueFixture> => {
  const slug = overrides.slug ?? `test-venue-${randomBytes(4).toString('hex')}`;
  const hash = await hashOnce();

  const venue = await prisma.venue.create({
    data: {
      slug,
      name: 'Test Mekânı',
      timezone: 'Europe/Istanbul',
      duplicateCooldownMinutes: overrides.duplicateCooldownMinutes ?? 30,
      pricing: {
        create: {
          currency: 'TRY',
          normalEnabled: true,
          normalPriceMinor: 0,
          priorityEnabled: true,
          priorityPriceMinor: 2000,
          djEnabled: true,
          djPriceMinor: 3000,
          playNextEnabled: true,
          playNextPriceMinor: overrides.playNextPriceMinor ?? 5000,
        },
      },
    },
  });

  const qrToken = randomBytes(24).toString('base64url');
  await prisma.venueQrCode.create({
    data: { venueId: venue.id, token: qrToken, tableLabel: 'Masa 7', active: true },
  });

  const ownerEmail = `owner-${randomBytes(4).toString('hex')}@example.com`;
  const djEmail = `dj-${randomBytes(4).toString('hex')}@example.com`;
  await prisma.venueUser.createMany({
    data: [
      {
        venueId: venue.id,
        email: ownerEmail,
        passwordHash: hash,
        name: 'Sahip',
        role: $Enums.VenueUserRole.OWNER,
      },
      {
        venueId: venue.id,
        email: djEmail,
        passwordHash: hash,
        name: 'DJ',
        role: $Enums.VenueUserRole.DJ,
      },
    ],
  });

  return { venueId: venue.id, slug, ownerEmail, djEmail, qrToken, tableLabel: 'Masa 7' };
};

/**
 * Track ids understood by the fake music provider, which the integration suite pins on so that no
 * test ever depends on a third party being reachable. Two of them are real provider ids — the
 * fake catalogue keeps playable tracks for local trials — but nothing here leaves the process.
 */
export const FAKE_TRACK_IDS = [
  'SCZgGVqVsbY',
  'fake-bir-derdim-var',
  'fake-papara',
  'Lw4unI3tVNQ',
  'fake-yaslanmadan',
  'fake-ben-boyleyim',
] as const;

/**
 * Inserts tracks straight through Prisma. Used by tests that need more distinct songs than the
 * fake catalogue holds, or that exercise the queue without going through request creation.
 */
export const createTracks = async (
  prisma: PrismaClient,
  count: number,
  prefix = 'bulk',
): Promise<string[]> => {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const track = await prisma.track.create({
      data: {
        provider: $Enums.MusicProvider.YOUTUBE,
        providerTrackId: `${prefix}-${randomBytes(4).toString('hex')}-${index}`,
        title: `Parça ${index + 1}`,
        artist: 'Test Sanatçı',
        durationSeconds: 180,
      },
    });
    ids.push(track.id);
  }
  return ids;
};

/** Creates requests already waiting for moderation, one per track. */
export const createPendingRequests = async (
  prisma: PrismaClient,
  venueId: string,
  trackIds: readonly string[],
  requestType: $Enums.RequestType = $Enums.RequestType.NORMAL,
): Promise<string[]> => {
  const ids: string[] = [];
  for (const trackId of trackIds) {
    const created = await prisma.songRequest.create({
      data: {
        venueId,
        trackId,
        requestType,
        status: $Enums.RequestStatus.PENDING,
        amountMinor: 0,
        currency: 'TRY',
      },
    });
    ids.push(created.id);
  }
  return ids;
};

export const SYSTEM_PASSWORD = VENUE_PASSWORD;
export const SYSTEM_EMAIL = 'system@example.com';

/** The operator account, which belongs to no venue. */
export const createSystemUserFixture = async (prisma: PrismaClient): Promise<string> => {
  const row = await prisma.systemUser.create({
    data: { email: SYSTEM_EMAIL, name: 'Sistem Yöneticisi', passwordHash: await hashOnce() },
  });
  return row.id;
};
