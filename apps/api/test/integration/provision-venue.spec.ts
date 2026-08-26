import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlaybackState, VenueUserRole } from '@moodisto/shared-types';
import { DATABASE, type Database } from '../../src/application/ports';
import { ProvisionVenueUseCase } from '../../src/system/provision-venue.usecase';
import { createHarness, type Harness } from './support/harness';

const input = {
  slug: 'yeni-kafe',
  name: 'Yeni Kafe',
  description: 'Köşedeki kafe',
  address: 'Kadıköy',
  logoUrl: null,
  timezone: 'Europe/Istanbul',
  latitude: 40.99,
  longitude: 29.03,
  owner: { name: 'Deniz Yılmaz', email: 'Deniz@Yeni-Kafe.test' },
  firstTableLabel: 'Masa 1',
};

/**
 * A café joins Moodisto in one step or not at all: half a venue — priced but with nobody to run it,
 * or staffed but with no QR code to scan — is not something an operator should ever have to repair
 * by hand.
 */
describe('ProvisionVenueUseCase', () => {
  let harness: Harness;
  let database: Database;
  let provision: ProvisionVenueUseCase;

  beforeAll(async () => {
    harness = await createHarness();
    database = harness.app.get<Database>(DATABASE);
    provision = harness.app.get(ProvisionVenueUseCase);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('opens a venue that is ready to take its first request', async () => {
    const created = await provision.execute(input);

    expect(created.venue).toMatchObject({ slug: 'yeni-kafe', name: 'Yeni Kafe', active: true });
    expect(created.owner).toMatchObject({
      email: 'deniz@yeni-kafe.test',
      role: VenueUserRole.OWNER,
      active: true,
    });
    expect(created.qrCode.tableLabel).toBe('Masa 1');
    expect(created.qrCode.joinUrl).toContain(`/join/${created.qrCode.token}`);

    const uow = database.read();
    await expect(uow.venues.getPricing(created.venue.id)).resolves.not.toBeNull();
    await expect(uow.player.getState(created.venue.id)).resolves.toMatchObject({
      state: PlaybackState.IDLE,
      queueItemId: null,
    });
    await expect(uow.qrCodes.listByVenue(created.venue.id)).resolves.toHaveLength(1);
  });

  it('stores only the hash of the password it hands out once', async () => {
    const created = await provision.execute(input);

    const owner = await database.read().venueUsers.findById(created.owner.id);
    expect(owner?.passwordHash).not.toContain(created.initialPassword);
    expect(owner?.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('lets the new owner sign in with the password it returned', async () => {
    const created = await provision.execute(input);
    const client = await harness.client();

    const response = await client.post('/api/auth/venue/login', {
      email: created.owner.email,
      password: created.initialPassword,
    });

    expect(response.status).toBe(201);
    expect(response.body.venue.slug).toBe('yeni-kafe');
  });

  it('never repeats a password across venues', async () => {
    const first = await provision.execute(input);
    const second = await provision.execute({
      ...input,
      slug: 'ikinci-kafe',
      owner: { name: 'Ece Kaya', email: 'ece@ikinci-kafe.test' },
    });

    expect(first.initialPassword).not.toBe(second.initialPassword);
  });

  it('refuses a slug another venue already answers to', async () => {
    await provision.execute(input);

    await expect(
      provision.execute({ ...input, owner: { name: 'Ece Kaya', email: 'ece@baska.test' } }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses an e-mail that already belongs to a venue account', async () => {
    await provision.execute(input);

    await expect(provision.execute({ ...input, slug: 'ucuncu-kafe' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('leaves nothing behind when provisioning is refused', async () => {
    await provision.execute(input);

    await expect(provision.execute({ ...input, slug: 'dorduncu-kafe' })).rejects.toThrow();

    const venues = await database.read().venues.list({ take: 10, skip: 0 });
    expect(venues.items.map((venue) => venue.slug)).toEqual(['yeni-kafe']);
  });
});
