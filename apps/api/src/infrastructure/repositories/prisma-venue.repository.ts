import { type Prisma } from '@moodisto/database';
import { RequestType } from '@moodisto/shared-types';
import type {
  CreateVenueInput,
  NearbyVenueRecord,
  VenueListRecord,
  VenuePricingRecord,
  VenuePricingUpdate,
  VenueRecord,
  VenueRepository,
  VenueSettingsUpdate,
} from '../../application/ports';
import { toVenuePricingRecord, toVenueRecord } from '../mappers';
import type { PrismaTx } from '../prisma-types';

interface NearbyRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string | null;
  logoUrl: string | null;
  active: boolean;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  duplicateCooldownMinutes: number;
  distanceMeters: number;
}

const PRICING_COLUMNS = {
  [RequestType.NORMAL]: { enabled: 'normalEnabled', price: 'normalPriceMinor' },
  [RequestType.PRIORITY]: { enabled: 'priorityEnabled', price: 'priorityPriceMinor' },
  [RequestType.DJ]: { enabled: 'djEnabled', price: 'djPriceMinor' },
  [RequestType.PLAY_NEXT]: { enabled: 'playNextEnabled', price: 'playNextPriceMinor' },
} as const;

export class PrismaVenueRepository implements VenueRepository {
  constructor(private readonly tx: PrismaTx) {}

  async findById(venueId: string): Promise<VenueRecord | null> {
    const row = await this.tx.venue.findUnique({ where: { id: venueId } });
    return row ? toVenueRecord(row) : null;
  }

  async findBySlug(slug: string): Promise<VenueRecord | null> {
    const row = await this.tx.venue.findUnique({ where: { slug } });
    return row ? toVenueRecord(row) : null;
  }

  async list(input: {
    search?: string;
    take: number;
    skip: number;
  }): Promise<{ items: readonly VenueListRecord[]; total: number }> {
    const where: Prisma.VenueWhereInput =
      input.search === undefined || input.search.length === 0
        ? {}
        : {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { slug: { contains: input.search, mode: 'insensitive' } },
            ],
          };

    const [rows, total] = await Promise.all([
      this.tx.venue.findMany({
        where,
        orderBy: [{ name: 'asc' }, { slug: 'asc' }],
        take: input.take,
        skip: input.skip,
        include: { _count: { select: { users: true } } },
      }),
      this.tx.venue.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({ ...toVenueRecord(row), userCount: row._count.users })),
      total,
    };
  }

  /**
   * Opens a venue with the pricing row it cannot work without. The prices themselves come from the
   * schema defaults, so the catalogue of what a request costs is stated in exactly one place.
   */
  async create(input: CreateVenueInput): Promise<VenueRecord> {
    const row = await this.tx.venue.create({
      data: { ...input, pricing: { create: {} } },
    });
    return toVenueRecord(row);
  }

  /** Great-circle distance in SQL: keeps the radius filter and the ordering on the database. */
  async findNearby(input: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    limit: number;
  }): Promise<readonly NearbyVenueRecord[]> {
    const rows = await this.tx.$queryRaw<NearbyRow[]>`
      SELECT v.id,
             v.slug,
             v.name,
             v.description,
             v.address,
             v."logoUrl",
             v.active,
             v.timezone,
             v.latitude,
             v.longitude,
             v."duplicateCooldownMinutes",
             (6371000 * acos(
                LEAST(1, GREATEST(-1,
                  cos(radians(${input.latitude}::float8)) * cos(radians(v.latitude))
                    * cos(radians(v.longitude) - radians(${input.longitude}::float8))
                  + sin(radians(${input.latitude}::float8)) * sin(radians(v.latitude))
                ))
             )) AS "distanceMeters"
      FROM venues v
      WHERE v.active = true
        AND v.latitude IS NOT NULL
        AND v.longitude IS NOT NULL
      ORDER BY "distanceMeters" ASC
      LIMIT ${input.limit}
    `;

    return rows
      .filter((row) => row.distanceMeters <= input.radiusMeters)
      .map((row) => ({
        ...toVenueRecord(row as unknown as Parameters<typeof toVenueRecord>[0]),
        distanceMeters: Math.round(row.distanceMeters),
      }));
  }

  async getPricing(venueId: string): Promise<VenuePricingRecord | null> {
    const row = await this.tx.venueRequestPricing.findUnique({ where: { venueId } });
    return row ? toVenuePricingRecord(row) : null;
  }

  async updatePricing(venueId: string, update: VenuePricingUpdate): Promise<VenuePricingRecord> {
    const data: Prisma.VenueRequestPricingUpdateInput = {};
    if (update.currency !== undefined) {
      data.currency = update.currency;
    }
    for (const option of update.options) {
      const columns = PRICING_COLUMNS[option.type];
      Reflect.set(data, columns.enabled, option.enabled);
      Reflect.set(data, columns.price, option.priceMinor);
    }

    const row = await this.tx.venueRequestPricing.upsert({
      where: { venueId },
      update: data,
      create: {
        venueId,
        ...(update.currency === undefined ? {} : { currency: update.currency }),
        ...Object.fromEntries(
          update.options.flatMap((option) => [
            [PRICING_COLUMNS[option.type].enabled, option.enabled],
            [PRICING_COLUMNS[option.type].price, option.priceMinor],
          ]),
        ),
      },
    });

    if (update.duplicateCooldownMinutes !== undefined) {
      await this.tx.venue.update({
        where: { id: venueId },
        data: { duplicateCooldownMinutes: update.duplicateCooldownMinutes },
      });
    }

    return toVenuePricingRecord(row);
  }

  async updateSettings(venueId: string, update: VenueSettingsUpdate): Promise<VenueRecord> {
    const row = await this.tx.venue.update({ where: { id: venueId }, data: { ...update } });
    return toVenueRecord(row);
  }

  /**
   * Serialises concurrent queue work for one venue. Taking this lock first everywhere gives a
   * single, global lock order and removes the deadlock risk between queue and player updates.
   */
  async lockForUpdate(venueId: string): Promise<void> {
    await this.tx.$queryRaw`SELECT id FROM venues WHERE id = ${venueId} FOR UPDATE`;
  }
}
