import type {
  BlockedRuleRepository,
  CustomerSessionRepository,
  PaymentRepository,
  PlayerRepository,
  ProviderQuotaRepository,
  QueueRepository,
  SongRequestRepository,
  StatsRepository,
  SystemSettingRepository,
  SystemUserRepository,
  TrackRepository,
  VenueQrCodeRepository,
  VenueRepository,
  VenueUserRepository,
} from './repositories';
import type { RealtimeMessage } from './event-publisher';

/**
 * A single consistent view over the persistence layer. Inside `Database.transaction` every
 * repository shares one transactional connection, so use cases can safely read-modify-write.
 */
export interface UnitOfWork {
  readonly venues: VenueRepository;
  readonly qrCodes: VenueQrCodeRepository;
  readonly venueUsers: VenueUserRepository;
  readonly customerSessions: CustomerSessionRepository;
  readonly tracks: TrackRepository;
  readonly songRequests: SongRequestRepository;
  readonly queue: QueueRepository;
  readonly player: PlayerRepository;
  readonly payments: PaymentRepository;
  readonly blockedRules: BlockedRuleRepository;
  readonly providerQuota: ProviderQuotaRepository;
  readonly stats: StatsRepository;
  readonly systemUsers: SystemUserRepository;
  readonly systemSettings: SystemSettingRepository;
  /**
   * Buffers a realtime message. Messages are dispatched only after the transaction commits, so
   * clients can never observe an event for a change that was rolled back.
   */
  publish(message: RealtimeMessage): void;
}

export interface Database {
  /** Non-transactional access for pure reads. */
  read(): UnitOfWork;
  transaction<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T>;
}

export const DATABASE = Symbol('DATABASE');
