import { Inject, Injectable } from '@nestjs/common';
import type { JoinVenueResponse } from '@moodisto/shared-types';
import { DATABASE, type Database } from '../application/ports';
import { NotFoundError } from '../common/errors';
import type { CustomerIdentity } from '../auth/authenticated-request';
import { VenueLookupService } from './venue-lookup.service';

@Injectable()
export class JoinVenueUseCase {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly lookup: VenueLookupService,
  ) {}

  /**
   * Turns a scanned QR token into a venue session. The token is opaque and single-purpose: it
   * identifies a table, never the guest, and it is looked up server-side so a guessed token
   * cannot reveal anything beyond a public venue page.
   */
  async execute(qrToken: string, customer: CustomerIdentity): Promise<JoinVenueResponse> {
    return this.database.transaction(async (uow) => {
      const qrCode = await uow.qrCodes.findByToken(qrToken);
      const invalid = new NotFoundError('QR kodu geçersiz veya süresi dolmuş.', 'QR_INVALID');
      if (!qrCode || !qrCode.active) {
        throw invalid;
      }
      if (qrCode.expiresAt && qrCode.expiresAt.getTime() <= Date.now()) {
        throw invalid;
      }

      const venue = await uow.venues.findById(qrCode.venueId);
      if (!venue || !venue.active) {
        throw invalid;
      }

      await uow.customerSessions.attachToVenue(customer.id, venue.id, qrCode.tableLabel);

      return {
        venue: await this.lookup.toDetail(uow, venue),
        tableLabel: qrCode.tableLabel,
      };
    });
  }
}
