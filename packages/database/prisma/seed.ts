/**
 * Development seed.
 *
 * Creates two venues so that "nearby venues" has something to show, one owner and one DJ account,
 * a handful of tracks, and a few song requests spread across the request lifecycle.
 */
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { buildTrackSearchText } from '@moodisto/queue-engine';
import { $Enums, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'admin@example.com';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'moodisto-dev-2026';
const DJ_EMAIL = 'dj@example.com';

const qrToken = (): string => randomBytes(24).toString('base64url');

const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

const DEMO_TRACKS = [
  {
    providerTrackId: 'demo-dudu',
    title: 'Dudu',
    artist: 'Tarkan',
    channelName: 'Tarkan Official',
    channelId: 'UC-demo-tarkan',
    durationSeconds: 222,
  },
  {
    providerTrackId: 'demo-bir-kadin-cizeceksin',
    title: 'Bir Kadın Çizeceksin',
    artist: 'maNga',
    channelName: 'maNga Official',
    channelId: 'UC-demo-manga',
    durationSeconds: 254,
  },
  {
    providerTrackId: 'demo-paramparca',
    title: 'Paramparça',
    artist: 'Teoman',
    channelName: 'Teoman Official',
    channelId: 'UC-demo-teoman',
    durationSeconds: 281,
  },
  {
    providerTrackId: 'demo-cambaz',
    title: 'Cambaz',
    artist: 'Mor ve Ötesi',
    channelName: 'Mor ve Ötesi Official',
    channelId: 'UC-demo-morveotesi',
    durationSeconds: 236,
  },
  {
    providerTrackId: 'demo-ask-marsi',
    title: 'Aşk Marşı',
    artist: 'Athena',
    channelName: 'Athena Official',
    channelId: 'UC-demo-athena',
    durationSeconds: 198,
  },
  {
    providerTrackId: 'demo-yalnizlik-senfonisi',
    title: 'Yalnızlık Senfonisi',
    artist: 'Duman',
    channelName: 'Duman Official',
    channelId: 'UC-demo-duman',
    durationSeconds: 268,
  },
] as const;

async function main(): Promise<void> {
  const passwordHash = await hashPassword(OWNER_PASSWORD);

  const cafeModa = await prisma.venue.upsert({
    where: { slug: 'cafe-moda' },
    update: {},
    create: {
      slug: 'cafe-moda',
      name: 'Cafe Moda',
      address: 'Caferağa Mah. Moda Cad. No:1, Kadıköy / İstanbul',
      latitude: 40.9862,
      longitude: 29.0264,
      timezone: 'Europe/Istanbul',
      duplicateCooldownMinutes: 30,
      active: true,
    },
  });

  const barBebek = await prisma.venue.upsert({
    where: { slug: 'bar-bebek' },
    update: {},
    create: {
      slug: 'bar-bebek',
      name: 'Bar Bebek',
      address: 'Bebek Mah. Cevdetpaşa Cad. No:42, Beşiktaş / İstanbul',
      latitude: 41.0776,
      longitude: 29.0433,
      timezone: 'Europe/Istanbul',
      active: true,
    },
  });

  for (const venue of [cafeModa, barBebek]) {
    await prisma.venueRequestPricing.upsert({
      where: { venueId: venue.id },
      update: {},
      create: {
        venueId: venue.id,
        currency: 'TRY',
        normalEnabled: true,
        normalPriceMinor: 0,
        priorityEnabled: true,
        priorityPriceMinor: 2_000,
        djEnabled: true,
        djPriceMinor: 3_000,
        playNextEnabled: true,
        playNextPriceMinor: 5_000,
      },
    });
    await prisma.playerState.upsert({
      where: { venueId: venue.id },
      update: {},
      create: { venueId: venue.id, state: $Enums.PlaybackState.IDLE },
    });
  }

  await prisma.venueUser.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, venueId: cafeModa.id },
    create: {
      venueId: cafeModa.id,
      email: OWNER_EMAIL,
      passwordHash,
      name: 'Cafe Moda Sahibi',
      role: $Enums.VenueUserRole.OWNER,
    },
  });

  await prisma.venueUser.upsert({
    where: { email: DJ_EMAIL },
    update: { passwordHash, venueId: cafeModa.id },
    create: {
      venueId: cafeModa.id,
      email: DJ_EMAIL,
      passwordHash,
      name: 'Cafe Moda DJ',
      role: $Enums.VenueUserRole.DJ,
    },
  });

  const existingQrCount = await prisma.venueQrCode.count({ where: { venueId: cafeModa.id } });
  if (existingQrCount === 0) {
    for (const tableLabel of ['Masa 1', 'Masa 2', 'Bar', 'Bahçe', 'VIP']) {
      await prisma.venueQrCode.create({
        data: { venueId: cafeModa.id, token: qrToken(), tableLabel },
      });
    }
  }
  if ((await prisma.venueQrCode.count({ where: { venueId: barBebek.id } })) === 0) {
    await prisma.venueQrCode.create({
      data: { venueId: barBebek.id, token: qrToken(), tableLabel: 'Bar' },
    });
  }

  const tracks = [];
  for (const track of DEMO_TRACKS) {
    tracks.push(
      await prisma.track.upsert({
        where: {
          provider_providerTrackId: {
            provider: $Enums.MusicProvider.YOUTUBE,
            providerTrackId: track.providerTrackId,
          },
        },
        // Seeded tracks are searched from the local catalogue like any other, so they need the
        // same folded search text a provider search would have written.
        update: { searchText: buildTrackSearchText(track) },
        create: {
          provider: $Enums.MusicProvider.YOUTUBE,
          providerTrackId: track.providerTrackId,
          title: track.title,
          artist: track.artist,
          channelName: track.channelName,
          channelId: track.channelId,
          durationSeconds: track.durationSeconds,
          thumbnailUrl: null,
          searchText: buildTrackSearchText(track),
          metadata: { seeded: true },
        },
      }),
    );
  }

  if ((await prisma.songRequest.count({ where: { venueId: cafeModa.id } })) > 0) {
    console.info('Seed: song requests already present, skipping request fixtures.');
    await report();
    return;
  }

  const session = await prisma.customerSession.create({
    data: {
      sessionToken: randomBytes(32).toString('base64url'),
      venueId: cafeModa.id,
      tableLabel: 'Masa 8',
    },
  });

  const now = Date.now();
  const minutesAgo = (minutes: number): Date => new Date(now - minutes * 60_000);

  // Two requests waiting for the venue's decision.
  for (const [index, track] of [tracks[0], tracks[1]].entries()) {
    if (track === undefined) continue;
    await prisma.songRequest.create({
      data: {
        venueId: cafeModa.id,
        customerSessionId: session.id,
        trackId: track.id,
        requestType: index === 0 ? $Enums.RequestType.NORMAL : $Enums.RequestType.PRIORITY,
        status: $Enums.RequestStatus.PENDING,
        amountMinor: index === 0 ? 0 : 2_000,
        currency: 'TRY',
        tableLabel: 'Masa 8',
        createdAt: minutesAgo(3 - index),
      },
    });
  }

  // Three accepted requests already waiting in the queue.
  let position = 1;
  for (const track of [tracks[2], tracks[3], tracks[4]]) {
    if (track === undefined) continue;
    const request = await prisma.songRequest.create({
      data: {
        venueId: cafeModa.id,
        customerSessionId: session.id,
        trackId: track.id,
        requestType: $Enums.RequestType.NORMAL,
        status: $Enums.RequestStatus.QUEUED,
        currency: 'TRY',
        tableLabel: 'Bar',
        createdAt: minutesAgo(20 - position),
        acceptedAt: minutesAgo(19 - position),
        queuedAt: minutesAgo(19 - position),
      },
    });
    await prisma.queueItem.create({
      data: {
        venueId: cafeModa.id,
        songRequestId: request.id,
        position,
        state: $Enums.QueueItemState.QUEUED,
      },
    });
    position += 1;
  }

  // One completed and one rejected request so that statistics are not empty.
  const completedTrack = tracks[5];
  if (completedTrack !== undefined) {
    const completed = await prisma.songRequest.create({
      data: {
        venueId: cafeModa.id,
        customerSessionId: session.id,
        trackId: completedTrack.id,
        requestType: $Enums.RequestType.PLAY_NEXT,
        status: $Enums.RequestStatus.COMPLETED,
        amountMinor: 5_000,
        currency: 'TRY',
        tableLabel: 'VIP',
        createdAt: minutesAgo(60),
        acceptedAt: minutesAgo(59),
        queuedAt: minutesAgo(59),
        playingAt: minutesAgo(55),
        completedAt: minutesAgo(50),
      },
    });
    await prisma.queueItem.create({
      data: {
        venueId: cafeModa.id,
        songRequestId: completed.id,
        position: 0,
        state: $Enums.QueueItemState.COMPLETED,
        startedAt: minutesAgo(55),
        completedAt: minutesAgo(50),
      },
    });
    await prisma.payment.create({
      data: {
        songRequestId: completed.id,
        provider: 'mock',
        providerPaymentId: `seed-${completed.id}`,
        amountMinor: 5_000,
        currency: 'TRY',
        status: $Enums.PaymentStatus.PAID,
        paidAt: minutesAgo(59),
      },
    });
  }

  const rejectedTrack = tracks[0];
  if (rejectedTrack !== undefined) {
    await prisma.songRequest.create({
      data: {
        venueId: cafeModa.id,
        customerSessionId: session.id,
        trackId: rejectedTrack.id,
        requestType: $Enums.RequestType.NORMAL,
        status: $Enums.RequestStatus.REJECTED,
        tableLabel: 'Masa 2',
        rejectionReason: 'Bu saatte daha sakin bir liste çalıyoruz.',
        createdAt: minutesAgo(90),
        rejectedAt: minutesAgo(89),
      },
    });
  }

  await prisma.blockedMusicRule.createMany({
    data: [
      { venueId: cafeModa.id, type: $Enums.BlockedRuleType.KEYWORD, value: 'hardcore' },
      { venueId: cafeModa.id, type: $Enums.BlockedRuleType.KEYWORD, value: 'diss track' },
    ],
    skipDuplicates: true,
  });

  await report();
}

async function report(): Promise<void> {
  const codes = await prisma.venueQrCode.findMany({
    where: { venue: { slug: 'cafe-moda' } },
    orderBy: { createdAt: 'asc' },
  });
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  console.info('\nSeed complete.\n');
  console.info(`  Venue admin login : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.info(`  DJ login          : ${DJ_EMAIL} / ${OWNER_PASSWORD}`);
  console.info('\n  QR join links:');
  for (const code of codes) {
    console.info(`    ${(code.tableLabel ?? 'Genel').padEnd(8)} ${appUrl}/join/${code.token}`);
  }
  console.info('');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
