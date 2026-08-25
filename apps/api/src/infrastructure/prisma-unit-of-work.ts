import type { RealtimeMessage, UnitOfWork } from '../application/ports';
import { PrismaBlockedRuleRepository } from './repositories/prisma-blocked-rule.repository';
import { PrismaCustomerSessionRepository } from './repositories/prisma-customer-session.repository';
import { PrismaPaymentRepository } from './repositories/prisma-payment.repository';
import { PrismaPlayerRepository } from './repositories/prisma-player.repository';
import { PrismaProviderQuotaRepository } from './repositories/prisma-provider-quota.repository';
import { PrismaQueueRepository } from './repositories/prisma-queue.repository';
import { PrismaSongRequestRepository } from './repositories/prisma-song-request.repository';
import { PrismaStatsRepository } from './repositories/prisma-stats.repository';
import { PrismaTrackRepository } from './repositories/prisma-track.repository';
import { PrismaVenueQrCodeRepository } from './repositories/prisma-venue-qr-code.repository';
import { PrismaVenueRepository } from './repositories/prisma-venue.repository';
import { PrismaVenueUserRepository } from './repositories/prisma-venue-user.repository';
import type { PrismaTx } from './prisma-types';

export class PrismaUnitOfWork implements UnitOfWork {
  readonly venues: PrismaVenueRepository;
  readonly qrCodes: PrismaVenueQrCodeRepository;
  readonly venueUsers: PrismaVenueUserRepository;
  readonly customerSessions: PrismaCustomerSessionRepository;
  readonly tracks: PrismaTrackRepository;
  readonly songRequests: PrismaSongRequestRepository;
  readonly queue: PrismaQueueRepository;
  readonly player: PrismaPlayerRepository;
  readonly payments: PrismaPaymentRepository;
  readonly blockedRules: PrismaBlockedRuleRepository;
  readonly providerQuota: PrismaProviderQuotaRepository;
  readonly stats: PrismaStatsRepository;

  private readonly buffered: RealtimeMessage[] = [];

  constructor(tx: PrismaTx) {
    this.venues = new PrismaVenueRepository(tx);
    this.qrCodes = new PrismaVenueQrCodeRepository(tx);
    this.venueUsers = new PrismaVenueUserRepository(tx);
    this.customerSessions = new PrismaCustomerSessionRepository(tx);
    this.tracks = new PrismaTrackRepository(tx);
    this.songRequests = new PrismaSongRequestRepository(tx);
    this.queue = new PrismaQueueRepository(tx);
    this.player = new PrismaPlayerRepository(tx);
    this.payments = new PrismaPaymentRepository(tx);
    this.blockedRules = new PrismaBlockedRuleRepository(tx);
    this.providerQuota = new PrismaProviderQuotaRepository(tx);
    this.stats = new PrismaStatsRepository(tx);
  }

  publish(message: RealtimeMessage): void {
    this.buffered.push(message);
  }

  drain(): readonly RealtimeMessage[] {
    return this.buffered.splice(0, this.buffered.length);
  }
}
