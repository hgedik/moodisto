import { Inject, Injectable } from '@nestjs/common';
import type { MusicProvider } from '@moodisto/music-provider';
import {
  DuplicateBlockReason,
  evaluateDuplicate,
  findBlockingRule,
  resolveRequestPrice,
} from '@moodisto/queue-engine';
import {
  RequestStatus,
  type CreateSongRequestResponse,
  type PaymentSessionDto,
} from '@moodisto/shared-types';
import type { CreateSongRequestInput } from '@moodisto/validation';
import {
  CLOCK,
  DATABASE,
  PAYMENT_PROVIDER,
  type Clock,
  type Database,
  type PaymentProvider,
  type SongRequestRecord,
  type TrackRecord,
  type VenueRecord,
} from '../application/ports';
import { toDomainPricing, toSongRequestDto } from '../application/dto-mappers';
import { publishRequestCreated } from '../application/services/realtime-messages';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { ConflictError, NotFoundError, UnprocessableError } from '../common/errors';
import { MUSIC_PROVIDER } from '../music/music-provider.factory';
import { ProviderQuotaService } from '../music/provider-quota.service';
import type { CustomerIdentity } from '../auth/authenticated-request';

/**
 * How long a guest may leave a checkout open. After this the request is expired, so an abandoned
 * payment stops looking pending to the guest who started it.
 */
const CHECKOUT_TTL_MINUTES = 30;

interface CreatedRequest {
  readonly request: SongRequestRecord;
  readonly requiresPayment: boolean;
  readonly description: string;
  readonly returnUrl: string;
}

/**
 * Turns "I want this song" into a persisted request.
 *
 * Provider and PSP calls deliberately happen outside the venue lock: holding it across a network
 * round trip would serialise every guest in the venue behind one slow HTTP response.
 */
@Injectable()
export class CreateSongRequestUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(MUSIC_PROVIDER) private readonly provider: MusicProvider,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly quota: ProviderQuotaService,
  ) {}

  async execute(
    venueSlug: string,
    input: CreateSongRequestInput,
    customer: CustomerIdentity,
  ): Promise<CreateSongRequestResponse> {
    const venue = await this.requireVenue(venueSlug);
    const track = await this.resolveTrack(input);
    const created = await this.persistRequest(venue, track, input, customer);

    if (!created.requiresPayment) {
      return { request: toSongRequestDto(created.request), payment: null };
    }

    const session = await this.payments.createSession({
      requestId: created.request.id,
      amountMinor: created.request.amountMinor,
      currency: created.request.currency,
      description: created.description,
      returnUrl: created.returnUrl,
    });

    const payment = await this.database.transaction((uow) =>
      uow.payments.create({
        songRequestId: created.request.id,
        provider: this.payments.id,
        providerPaymentId: session.providerPaymentId,
        amountMinor: created.request.amountMinor,
        currency: created.request.currency,
        checkoutUrl: session.checkoutUrl,
      }),
    );

    const paymentDto: PaymentSessionDto = {
      paymentId: payment.id,
      provider: payment.provider,
      status: session.status,
      checkoutUrl: session.checkoutUrl,
      checkoutFormContent: session.checkoutFormContent,
      expiresAt: session.expiresAt?.toISOString() ?? null,
    };
    return { request: toSongRequestDto(created.request), payment: paymentDto };
  }

  private async requireVenue(venueSlug: string): Promise<VenueRecord> {
    const venue = await this.database.read().venues.findBySlug(venueSlug);
    if (!venue || !venue.active) {
      throw new NotFoundError('Mekân bulunamadı.', 'VENUE_NOT_FOUND');
    }
    return venue;
  }

  /**
   * Runs every rule that depends on the venue's live queue under the venue lock, so two guests
   * requesting the same song at the same instant cannot both pass the duplicate check.
   */
  private async persistRequest(
    venue: VenueRecord,
    track: TrackRecord,
    input: CreateSongRequestInput,
    customer: CustomerIdentity,
  ): Promise<CreatedRequest> {
    const now = this.clock.now();

    return this.database.transaction(async (uow) => {
      await uow.venues.lockForUpdate(venue.id);

      // The venue lock is already held here, which makes this the cheapest honest place to retire
      // checkouts nobody came back to.
      await uow.songRequests.expireStalePendingPayments(
        venue.id,
        new Date(now.getTime() - CHECKOUT_TTL_MINUTES * 60_000),
      );

      const rules = await uow.blockedRules.listByVenue(venue.id);
      const blocking = findBlockingRule(rules, track);
      if (blocking) {
        throw new UnprocessableError('Bu parça mekân tarafından engellenmiş.', 'TRACK_BLOCKED', {
          ruleType: blocking.type,
        });
      }

      const duplicate = evaluateDuplicate({
        trackId: track.id,
        activeTrackIds: await uow.songRequests.findActiveTrackIds(venue.id),
        lastCompletedAt: await uow.songRequests.findLastCompletedAt(venue.id, track.id),
        cooldownMinutes: venue.duplicateCooldownMinutes,
        now,
      });
      if (duplicate.blocked) {
        throw new ConflictError(
          duplicate.reason === DuplicateBlockReason.ALREADY_IN_QUEUE
            ? 'Bu parça zaten sırada.'
            : 'Bu parça az önce çalındı, lütfen biraz sonra tekrar deneyin.',
          duplicate.reason ?? 'DUPLICATE',
          { retryAfterSeconds: duplicate.retryAfterSeconds },
        );
      }

      const pricingRecord = await uow.venues.getPricing(venue.id);
      if (!pricingRecord) {
        throw new NotFoundError('Mekân fiyatlandırması tanımlı değil.', 'VENUE_PRICING_MISSING');
      }
      const price = resolveRequestPrice(toDomainPricing(pricingRecord), input.requestType, {
        paidRequestsEnabled: this.config.features.paidRequests,
      });

      // The table label is server-side state from the scanned QR code; the body is only a
      // fallback for guests who opened the venue page without scanning.
      const tableLabel =
        (customer.venueId === venue.id ? customer.tableLabel : null) ?? input.tableLabel ?? null;
      if (customer.venueId !== venue.id) {
        await uow.customerSessions.attachToVenue(customer.id, venue.id, tableLabel);
      }

      const request = await uow.songRequests.create({
        venueId: venue.id,
        customerSessionId: customer.id,
        trackId: track.id,
        requestType: input.requestType,
        status: price.requiresPayment ? RequestStatus.PENDING_PAYMENT : RequestStatus.PENDING,
        tableLabel,
        amountMinor: price.priceMinor,
        currency: price.currency,
      });

      // A request awaiting payment is not shown to the venue yet; the webhook announces it.
      if (!price.requiresPayment) {
        publishRequestCreated(uow, toSongRequestDto(request));
      }

      return {
        request,
        requiresPayment: price.requiresPayment,
        description: `${venue.name} — ${track.title}`,
        returnUrl: `${this.config.appUrl}/v/${venue.slug}/request/${request.id}`,
      };
    });
  }

  /**
   * Prefers the copy persisted by search. Only an unseen track costs a provider lookup, and the
   * client never supplies title, artist or duration.
   */
  private async resolveTrack(input: CreateSongRequestInput): Promise<TrackRecord> {
    const known = await this.database
      .read()
      .tracks.findByProviderTrackId(input.provider, input.providerTrackId);
    if (known) {
      return known;
    }

    // This is what the request reserve exists for: a guest who has already chosen their song must
    // not be turned away because the evening's searching used the allowance up.
    await this.quota.consumeTrackLookup();
    const fetched = await this.provider.getTrack(input.providerTrackId);
    if (!fetched) {
      throw new NotFoundError('Parça bulunamadı.', 'TRACK_NOT_FOUND');
    }

    const [created] = await this.database.transaction((uow) =>
      uow.tracks.upsertMany([
        {
          provider: fetched.provider,
          providerTrackId: fetched.providerTrackId,
          title: fetched.title,
          artist: fetched.artist,
          channelName: fetched.channelName,
          channelId: fetched.channelId,
          thumbnailUrl: fetched.thumbnailUrl,
          durationSeconds: fetched.durationSeconds,
        },
      ]),
    );
    if (!created) {
      throw new NotFoundError('Parça bulunamadı.', 'TRACK_NOT_FOUND');
    }
    return created;
  }
}
