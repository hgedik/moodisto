import { Inject, Injectable } from '@nestjs/common';
import type {
  PaginatedResponse,
  SystemVenueDetailDto,
  SystemVenueDto,
} from '@moodisto/shared-types';
import type { SystemVenuesQuery } from '@moodisto/validation';
import { DATABASE, type Database } from '../application/ports';
import { toSystemVenueDto, toVenueUserDto } from '../application/dto-mappers';
import { VenueLookupService } from '../venues/venue-lookup.service';

/** The operator's read-only view of the venues this installation serves. */
@Injectable()
export class SystemVenuesService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly lookup: VenueLookupService,
  ) {}

  /**
   * `total` counts every match rather than the page, so a console that had to cut the list can say
   * how much it is not showing instead of implying there is nothing more.
   */
  async list(query: SystemVenuesQuery): Promise<PaginatedResponse<SystemVenueDto>> {
    const page = await this.database.read().venues.list({
      search: query.search,
      take: query.take,
      skip: query.skip,
    });
    return { items: page.items.map(toSystemVenueDto), total: page.total };
  }

  /** Deliberately by id and without the active filter: an operator has to be able to reopen a venue they closed. */
  async detail(venueId: string): Promise<SystemVenueDetailDto> {
    const venue = await this.lookup.detailById(venueId);
    const users = await this.database.read().venueUsers.listByVenue(venueId);
    return { venue, users: users.map(toVenueUserDto) };
  }
}
