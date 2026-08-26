import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  CreatedVenueDto,
  PaginatedResponse,
  SystemVenueDetailDto,
  SystemVenueDto,
  VenueDetailDto,
} from '@moodisto/shared-types';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createSystemUserFixture,
  createVenueFixture,
  SYSTEM_EMAIL,
  SYSTEM_PASSWORD,
  VENUE_PASSWORD,
} from './support/fixtures';

const newVenue = {
  slug: 'yeni-kafe',
  name: 'Yeni Kafe',
  description: 'Köşedeki kafe',
  address: 'Kadıköy',
  timezone: 'Europe/Istanbul',
  latitude: 40.99,
  longitude: 29.03,
  owner: { name: 'Deniz Yılmaz', email: 'deniz@yeni-kafe.test' },
  firstTableLabel: 'Masa 1',
};

/**
 * Until now a café could only join Moodisto by editing the seed script. These tests describe the
 * console that replaces it — and the wall that keeps everyone but an operator out of it.
 */
describe('system venue management', () => {
  let harness: Harness;

  const signIn = async (): Promise<Client> => {
    const client = await harness.client();
    await client
      .post('/api/auth/system/login', { email: SYSTEM_EMAIL, password: SYSTEM_PASSWORD })
      .expect(201);
    return client;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await createSystemUserFixture(harness.prisma);
  });

  it('creates a venue an owner can immediately sign in to', async () => {
    const client = await signIn();

    const response = await client.post('/api/system/venues', newVenue).expect(201);
    const body = response.body as CreatedVenueDto;

    expect(body.venue).toMatchObject({ slug: 'yeni-kafe', active: true, userCount: 1 });
    expect(body.qrCode.joinUrl).toContain(`/join/${body.qrCode.token}`);
    expect(body.initialPassword.length).toBeGreaterThanOrEqual(8);

    const owner = await harness.client();
    await owner
      .post('/api/auth/venue/login', {
        email: newVenue.owner.email,
        password: body.initialPassword,
      })
      .expect(201);
  });

  it('refuses an address or an e-mail that is already taken', async () => {
    const client = await signIn();
    await client.post('/api/system/venues', newVenue).expect(201);

    await client
      .post('/api/system/venues', {
        ...newVenue,
        owner: { name: 'Ece Kaya', email: 'ece@baska.test' },
      })
      .expect(409);
    await client.post('/api/system/venues', { ...newVenue, slug: 'ikinci-kafe' }).expect(409);
  });

  it('rejects a name that is too short before anything is written', async () => {
    const client = await signIn();

    await client.post('/api/system/venues', { ...newVenue, name: 'A' }).expect(400);
  });

  it('lists venues with their staff size and searches by name or address', async () => {
    await createVenueFixture(harness.prisma, { slug: 'kadikoy-kahve' });
    await createVenueFixture(harness.prisma, { slug: 'besiktas-bar' });
    const client = await signIn();

    const all = await client.get('/api/system/venues').expect(200);
    const listed = all.body as PaginatedResponse<SystemVenueDto>;
    expect(listed.total).toBe(2);
    expect(listed.items.every((venue) => venue.userCount === 2)).toBe(true);

    const filtered = await client.get('/api/system/venues?search=kadikoy').expect(200);
    expect((filtered.body as PaginatedResponse<SystemVenueDto>).items).toHaveLength(1);
  });

  it('reads one venue together with the people who run it', async () => {
    const venue = await createVenueFixture(harness.prisma);
    const client = await signIn();

    const response = await client.get(`/api/system/venues/${venue.venueId}`).expect(200);
    const body = response.body as SystemVenueDetailDto;

    expect(body.venue.slug).toBe(venue.slug);
    expect(body.users.map((user) => user.email).sort()).toEqual(
      [venue.ownerEmail, venue.djEmail].sort(),
    );
    expect(body.users.some((user) => 'passwordHash' in user)).toBe(false);
  });

  it('answers with 404 for a venue that does not exist', async () => {
    const client = await signIn();

    await client.get('/api/system/venues/cmvenuedoesnotexist0001').expect(404);
  });

  it('edits a venue and closes it to guests when it is deactivated', async () => {
    const venue = await createVenueFixture(harness.prisma);
    const client = await signIn();

    const response = await client
      .patch(`/api/system/venues/${venue.venueId}`, {
        name: 'Yeniden Adlandırıldı',
        description: null,
        address: 'Beşiktaş',
        timezone: 'Europe/Istanbul',
        latitude: null,
        longitude: null,
        logoUrl: null,
        active: false,
      })
      .expect(200);

    expect((response.body as VenueDetailDto).name).toBe('Yeniden Adlandırıldı');

    const guest = await harness.client();
    await guest.get(`/api/venues/${venue.slug}`).expect(404);
  });

  it('keeps everyone but an operator out', async () => {
    const venue = await createVenueFixture(harness.prisma);

    const anonymous = await harness.client();
    await anonymous.get('/api/system/venues').expect(401);

    const venueUser = await harness.client();
    await venueUser
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);
    await venueUser.get('/api/system/venues').expect(401);

    const operator = await signIn();
    await operator.agent
      .post('/api/system/venues')
      .send(newVenue)
      .set('Content-Type', 'application/json')
      .expect(403);
  });
});
