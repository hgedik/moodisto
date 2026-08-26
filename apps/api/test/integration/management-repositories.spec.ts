import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VenueUserRole } from '@moodisto/shared-types';
import { DATABASE, type Database } from '../../src/application/ports';
import { createVenueFixture } from './support/fixtures';
import { createHarness, type Harness } from './support/harness';

/**
 * Until now a venue and its users could only be born in the seed script. These tests pin the
 * persistence contract the system console is built on: creating a venue that already works, and
 * editing the accounts that reach it.
 */
describe('venue and account management persistence', () => {
  let harness: Harness;
  let database: Database;

  beforeAll(async () => {
    harness = await createHarness();
    database = harness.app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('creates a venue together with the pricing row it cannot work without', async () => {
    const venue = await database.transaction(async (uow) =>
      uow.venues.create({
        slug: 'yeni-kafe',
        name: 'Yeni Kafe',
        description: 'Köşedeki kafe',
        address: 'Kadıköy',
        logoUrl: null,
        timezone: 'Europe/Istanbul',
        latitude: 40.99,
        longitude: 29.03,
      }),
    );

    expect(venue).toMatchObject({ slug: 'yeni-kafe', name: 'Yeni Kafe', active: true });

    const pricing = await database.read().venues.getPricing(venue.id);
    expect(pricing).toMatchObject({
      currency: 'TRY',
      normalPriceMinor: 0,
      priorityPriceMinor: 2000,
      djPriceMinor: 3000,
      playNextPriceMinor: 5000,
    });
  });

  it('lists venues by name, counts their users and reports the untruncated total', async () => {
    await createVenueFixture(harness.prisma, { slug: 'kadikoy-kahve' });
    await createVenueFixture(harness.prisma, { slug: 'besiktas-bar' });

    const all = await database.read().venues.list({ take: 10, skip: 0 });
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.slug)).toEqual(['besiktas-bar', 'kadikoy-kahve']);
    expect(all.items[0]?.userCount).toBe(2);

    const searched = await database.read().venues.list({ search: 'KADIKOY', take: 10, skip: 0 });
    expect(searched.items.map((item) => item.slug)).toEqual(['kadikoy-kahve']);
    expect(searched.total).toBe(1);

    const firstPage = await database.read().venues.list({ take: 1, skip: 0 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBe(2);
  });

  it('creates, lists and edits the users of one venue', async () => {
    const fixture = await createVenueFixture(harness.prisma);

    const created = await database.transaction(async (uow) =>
      uow.venueUsers.create({
        venueId: fixture.venueId,
        email: 'yeni@example.com',
        name: 'Yeni Yönetici',
        role: VenueUserRole.MANAGER,
        passwordHash: 'hash',
      }),
    );
    expect(created).toMatchObject({ email: 'yeni@example.com', role: VenueUserRole.MANAGER });

    const users = await database.read().venueUsers.listByVenue(fixture.venueId);
    expect(users).toHaveLength(3);
    expect(users.map((user) => user.email)).toContain('yeni@example.com');

    const updated = await database.transaction(async (uow) =>
      uow.venueUsers.update(created.id, {
        name: 'Yönetici',
        role: VenueUserRole.DJ,
        active: false,
      }),
    );
    expect(updated).toMatchObject({ name: 'Yönetici', role: VenueUserRole.DJ, active: false });

    await database.transaction(async (uow) => uow.venueUsers.updatePassword(created.id, 'hash-2'));
    expect((await database.read().venueUsers.findById(created.id))?.passwordHash).toBe('hash-2');
  });

  it('creates, lists and edits system operators', async () => {
    const created = await database.transaction(async (uow) =>
      uow.systemUsers.create({
        email: 'ops@example.com',
        name: 'Operatör',
        passwordHash: 'hash',
      }),
    );
    expect(created).toMatchObject({ email: 'ops@example.com', active: true, lastLoginAt: null });
    expect(created.createdAt).toBeInstanceOf(Date);

    const operators = await database.read().systemUsers.list();
    expect(operators.map((operator) => operator.email)).toEqual(['ops@example.com']);

    const updated = await database.transaction(async (uow) =>
      uow.systemUsers.update(created.id, { name: 'Kıdemli Operatör', active: false }),
    );
    expect(updated).toMatchObject({ name: 'Kıdemli Operatör', active: false });

    await database.transaction(async (uow) => uow.systemUsers.updatePassword(created.id, 'hash-2'));
    expect((await database.read().systemUsers.findById(created.id))?.passwordHash).toBe('hash-2');
  });
});
