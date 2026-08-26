import { Inject, Injectable } from '@nestjs/common';
import {
  RequestStatus,
  type BlockedRuleDto,
  type PaginatedResponse,
  type QrCodeDto,
  type SongRequestDto,
  type VenueDetailDto,
  type VenuePricingDto,
} from '@moodisto/shared-types';
import type {
  AdminRequestsQuery,
  CreateBlockedRuleInput,
  CreateQrCodeInput,
  UpdateVenuePricingInput,
  UpdateVenueSettingsInput,
} from '@moodisto/validation';
import {
  DATABASE,
  TOKEN_GENERATOR,
  type Database,
  type TokenGenerator,
} from '../application/ports';
import {
  toBlockedRuleDto,
  toQrCodeDto,
  toSongRequestDto,
  toVenuePricingDto,
} from '../application/dto-mappers';
import { BadRequestError, NotFoundError } from '../common/errors';
import { VenueLookupService } from '../venues/venue-lookup.service';

const parseStatuses = (raw: string | undefined): readonly RequestStatus[] | undefined => {
  if (!raw) {
    return undefined;
  }
  const known = new Set<string>(Object.values(RequestStatus));
  const statuses = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => known.has(value)) as RequestStatus[];
  return statuses.length > 0 ? statuses : undefined;
};

/** Everything the venue console reads or edits about its own venue. */
@Injectable()
export class VenueAdminService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    private readonly lookup: VenueLookupService,
  ) {}

  async listRequests(
    venueId: string,
    query: AdminRequestsQuery,
  ): Promise<PaginatedResponse<SongRequestDto>> {
    const statuses = parseStatuses(query.status);
    const { items, total } = await this.database.read().songRequests.list({
      venueId,
      statuses,
      // An explicit filter is honoured as asked; the default view shows only what the venue was
      // actually told about.
      excludeUnannounced: statuses === undefined,
      take: query.limit,
      skip: 0,
    });
    return { items: items.map(toSongRequestDto), total };
  }

  async detail(venueId: string): Promise<VenueDetailDto> {
    return this.lookup.detailById(venueId);
  }

  async updateSettings(venueId: string, input: UpdateVenueSettingsInput): Promise<VenueDetailDto> {
    await this.database.transaction((uow) =>
      uow.venues.updateSettings(venueId, {
        name: input.name,
        description: input.description ?? null,
        address: input.address ?? null,
        timezone: input.timezone,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        logoUrl: input.logoUrl ?? null,
        active: input.active,
      }),
    );
    return this.lookup.detailById(venueId);
  }

  async pricing(venueId: string): Promise<VenuePricingDto> {
    const venue = await this.lookup.requireById(venueId);
    const pricing = await this.database.read().venues.getPricing(venueId);
    if (!pricing) {
      throw new NotFoundError('Mekân fiyatlandırması tanımlı değil.', 'VENUE_PRICING_MISSING');
    }
    return toVenuePricingDto(pricing, venue.duplicateCooldownMinutes);
  }

  async updatePricing(venueId: string, input: UpdateVenuePricingInput): Promise<VenuePricingDto> {
    const seen = new Set(input.options.map((option) => option.type));
    if (seen.size !== input.options.length) {
      throw new BadRequestError('Her istek türü yalnızca bir kez tanımlanabilir.');
    }

    const pricing = await this.database.transaction(async (uow) => {
      const updated = await uow.venues.updatePricing(venueId, {
        currency: input.currency,
        options: input.options,
        duplicateCooldownMinutes: input.duplicateCooldownMinutes,
      });
      await uow.venues.updateSettings(venueId, {
        duplicateCooldownMinutes: input.duplicateCooldownMinutes,
      });
      return updated;
    });
    return toVenuePricingDto(pricing, input.duplicateCooldownMinutes);
  }

  async listBlockedRules(venueId: string): Promise<readonly BlockedRuleDto[]> {
    const rules = await this.database.read().blockedRules.listByVenue(venueId);
    return rules.map(toBlockedRuleDto);
  }

  async createBlockedRule(venueId: string, input: CreateBlockedRuleInput): Promise<BlockedRuleDto> {
    const rule = await this.database.transaction((uow) =>
      uow.blockedRules.create({ venueId, type: input.type, value: input.value }),
    );
    return toBlockedRuleDto(rule);
  }

  async removeBlockedRule(venueId: string, ruleId: string): Promise<void> {
    const removed = await this.database.transaction((uow) =>
      uow.blockedRules.remove(venueId, ruleId),
    );
    if (!removed) {
      throw new NotFoundError('Filtre bulunamadı.', 'BLOCKED_RULE_NOT_FOUND');
    }
  }

  async listQrCodes(venueId: string, appUrl: string): Promise<readonly QrCodeDto[]> {
    const codes = await this.database.read().qrCodes.listByVenue(venueId);
    return codes.map((code) => toQrCodeDto(code, appUrl));
  }

  async createQrCode(
    venueId: string,
    input: CreateQrCodeInput,
    appUrl: string,
  ): Promise<QrCodeDto> {
    const code = await this.database.transaction((uow) =>
      uow.qrCodes.create({
        venueId,
        token: this.tokens.generate(24),
        tableLabel: input.tableLabel ?? null,
        expiresAt: null,
      }),
    );
    return toQrCodeDto(code, appUrl);
  }

  async deactivateQrCode(venueId: string, qrCodeId: string): Promise<void> {
    const deactivated = await this.database.transaction((uow) =>
      uow.qrCodes.deactivate(venueId, qrCodeId),
    );
    if (!deactivated) {
      throw new NotFoundError('QR kod bulunamadı.', 'QR_CODE_NOT_FOUND');
    }
  }
}
