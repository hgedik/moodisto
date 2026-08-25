import { Inject, Injectable } from '@nestjs/common';
import type { VenueDetailDto } from '@moodisto/shared-types';
import { DATABASE, type Database, type UnitOfWork, type VenueRecord } from '../application/ports';
import { toVenueDetailDto } from '../application/dto-mappers';
import { NotFoundError } from '../common/errors';

@Injectable()
export class VenueLookupService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async requireBySlug(slug: string): Promise<VenueRecord> {
    const venue = await this.database.read().venues.findBySlug(slug);
    if (!venue || !venue.active) {
      throw new NotFoundError('Mekân bulunamadı.', 'VENUE_NOT_FOUND');
    }
    return venue;
  }

  async requireById(venueId: string): Promise<VenueRecord> {
    const venue = await this.database.read().venues.findById(venueId);
    if (!venue) {
      throw new NotFoundError('Mekân bulunamadı.', 'VENUE_NOT_FOUND');
    }
    return venue;
  }

  async toDetail(uow: UnitOfWork, venue: VenueRecord): Promise<VenueDetailDto> {
    const pricing = await uow.venues.getPricing(venue.id);
    if (!pricing) {
      throw new NotFoundError('Mekân fiyatlandırması tanımlı değil.', 'VENUE_PRICING_MISSING');
    }
    const queueLength = await uow.queue.countQueued(venue.id);
    return toVenueDetailDto(venue, pricing, queueLength);
  }

  async detailBySlug(slug: string): Promise<VenueDetailDto> {
    const venue = await this.requireBySlug(slug);
    return this.toDetail(this.database.read(), venue);
  }

  async detailById(venueId: string): Promise<VenueDetailDto> {
    const venue = await this.requireById(venueId);
    return this.toDetail(this.database.read(), venue);
  }
}
