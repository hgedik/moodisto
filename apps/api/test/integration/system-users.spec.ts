import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VenueUserRole } from '@moodisto/shared-types';
import type {
  CreatedSystemUserDto,
  CreatedVenueUserDto,
  PasswordResetDto,
  SystemUserDto,
  VenueUserDto,
} from '@moodisto/shared-types';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createSystemUserFixture,
  createVenueFixture,
  SYSTEM_EMAIL,
  SYSTEM_PASSWORD,
  VENUE_PASSWORD,
  type VenueFixture,
} from './support/fixtures';

/**
 * Accounts are never deleted, only switched off — which is exactly why the rules about who may be
 * switched off matter: a venue nobody owns, or an installation no operator can reach, cannot be
 * repaired from the console that broke it.
 */
describe('system account management', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let operatorId: string;

  const signIn = async (): Promise<Client> => {
    const client = await harness.client();
    await client
      .post('/api/auth/system/login', { email: SYSTEM_EMAIL, password: SYSTEM_PASSWORD })
      .expect(201);
    return client;
  };

  const venueUsers = async (client: Client): Promise<readonly VenueUserDto[]> =>
    (await client.get(`/api/system/venues/${venue.venueId}/users`).expect(200))
      .body as readonly VenueUserDto[];

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    operatorId = await createSystemUserFixture(harness.prisma);
    venue = await createVenueFixture(harness.prisma);
  });

  it('adds a venue account that can sign in with the password it hands back', async () => {
    const client = await signIn();

    const response = await client
      .post(`/api/system/venues/${venue.venueId}/users`, {
        email: 'Yeni.DJ@Mekan.test',
        name: 'Yeni DJ',
        role: VenueUserRole.DJ,
      })
      .expect(201);
    const body = response.body as CreatedVenueUserDto;

    expect(body.user).toMatchObject({ email: 'yeni.dj@mekan.test', role: VenueUserRole.DJ });

    const dj = await harness.client();
    await dj
      .post('/api/auth/venue/login', {
        email: 'yeni.dj@mekan.test',
        password: body.initialPassword,
      })
      .expect(201);
    expect(await venueUsers(client)).toHaveLength(3);
  });

  it('refuses an e-mail that already belongs to somebody', async () => {
    const client = await signIn();

    await client
      .post(`/api/system/venues/${venue.venueId}/users`, {
        email: venue.djEmail,
        name: 'Kopya',
        role: VenueUserRole.DJ,
      })
      .expect(409);
  });

  it('changes a role and closes an account without deleting it', async () => {
    const client = await signIn();
    const dj = (await venueUsers(client)).find((user) => user.email === venue.djEmail);

    const response = await client
      .patch(`/api/system/venues/${venue.venueId}/users/${dj?.id}`, {
        name: 'Eski DJ',
        role: VenueUserRole.MANAGER,
        active: false,
      })
      .expect(200);

    expect(response.body as VenueUserDto).toMatchObject({
      name: 'Eski DJ',
      role: VenueUserRole.MANAGER,
      active: false,
    });
    expect(await venueUsers(client)).toHaveLength(2);

    const closed = await harness.client();
    await closed
      .post('/api/auth/venue/login', { email: venue.djEmail, password: VENUE_PASSWORD })
      .expect(401);
  });

  it('never leaves a venue without an owner', async () => {
    const client = await signIn();
    const owner = (await venueUsers(client)).find((user) => user.email === venue.ownerEmail);

    await client
      .patch(`/api/system/venues/${venue.venueId}/users/${owner?.id}`, {
        name: 'Sahip',
        role: VenueUserRole.OWNER,
        active: false,
      })
      .expect(422);
    await client
      .patch(`/api/system/venues/${venue.venueId}/users/${owner?.id}`, {
        name: 'Sahip',
        role: VenueUserRole.DJ,
        active: true,
      })
      .expect(422);
  });

  it('refuses to touch an account that belongs to another venue', async () => {
    const other = await createVenueFixture(harness.prisma);
    const client = await signIn();
    const stranger = (
      (await client.get(`/api/system/venues/${other.venueId}/users`).expect(200))
        .body as readonly VenueUserDto[]
    )[0];

    await client
      .patch(`/api/system/venues/${venue.venueId}/users/${stranger?.id}`, {
        name: 'Yabancı',
        role: VenueUserRole.DJ,
        active: true,
      })
      .expect(404);
  });

  it('resets a venue password so that only the new one works', async () => {
    const client = await signIn();
    const dj = (await venueUsers(client)).find((user) => user.email === venue.djEmail);

    const response = await client
      .post(`/api/system/venues/${venue.venueId}/users/${dj?.id}/password`)
      .expect(201);
    const { initialPassword } = response.body as PasswordResetDto;

    const withOld = await harness.client();
    await withOld
      .post('/api/auth/venue/login', { email: venue.djEmail, password: VENUE_PASSWORD })
      .expect(401);

    const withNew = await harness.client();
    await withNew
      .post('/api/auth/venue/login', { email: venue.djEmail, password: initialPassword })
      .expect(201);
  });

  it('closes the console when the venue itself is deactivated', async () => {
    const client = await signIn();
    await client
      .patch(`/api/system/venues/${venue.venueId}`, {
        name: 'Kapalı Mekân',
        description: null,
        address: null,
        timezone: 'Europe/Istanbul',
        latitude: null,
        longitude: null,
        logoUrl: null,
        active: false,
      })
      .expect(200);

    const owner = await harness.client();
    await owner
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(401);
  });

  it('adds an operator who can then reach the console', async () => {
    const client = await signIn();

    const response = await client
      .post('/api/system/users', { email: 'ikinci@moodisto.test', name: 'İkinci Operatör' })
      .expect(201);
    const body = response.body as CreatedSystemUserDto;

    expect(body.user).toMatchObject({ email: 'ikinci@moodisto.test', active: true });
    expect(body.user.lastLoginAt).toBeNull();

    const second = await harness.client();
    await second
      .post('/api/auth/system/login', {
        email: 'ikinci@moodisto.test',
        password: body.initialPassword,
      })
      .expect(201);

    const listed = (await client.get('/api/system/users').expect(200))
      .body as readonly SystemUserDto[];
    expect(listed).toHaveLength(2);
    expect(listed.some((user) => 'passwordHash' in user)).toBe(false);
  });

  it('refuses to let an operator lock themselves out', async () => {
    const client = await signIn();

    await client
      .patch(`/api/system/users/${operatorId}`, { name: 'Sistem Yöneticisi', active: false })
      .expect(422);
  });

  it('keeps the last active operator active', async () => {
    const client = await signIn();
    const second = (
      await client
        .post('/api/system/users', { email: 'ikinci@moodisto.test', name: 'İkinci Operatör' })
        .expect(201)
    ).body as CreatedSystemUserDto;

    // The second operator switches off the first, then finds they are the last one standing.
    const secondClient = await harness.client();
    await secondClient
      .post('/api/auth/system/login', {
        email: 'ikinci@moodisto.test',
        password: second.initialPassword,
      })
      .expect(201);
    await secondClient
      .patch(`/api/system/users/${operatorId}`, { name: 'Sistem Yöneticisi', active: false })
      .expect(200);
    await secondClient
      .patch(`/api/system/users/${second.user.id}`, { name: 'İkinci Operatör', active: false })
      .expect(422);

    const closed = await harness.client();
    await closed
      .post('/api/auth/system/login', { email: SYSTEM_EMAIL, password: SYSTEM_PASSWORD })
      .expect(401);
  });

  it('resets an operator password', async () => {
    const client = await signIn();
    const second = (
      await client
        .post('/api/system/users', { email: 'ikinci@moodisto.test', name: 'İkinci Operatör' })
        .expect(201)
    ).body as CreatedSystemUserDto;

    const reset = (await client.post(`/api/system/users/${second.user.id}/password`).expect(201))
      .body as PasswordResetDto;

    const withNew = await harness.client();
    await withNew
      .post('/api/auth/system/login', {
        email: 'ikinci@moodisto.test',
        password: reset.initialPassword,
      })
      .expect(201);
  });

  it('keeps venue staff out of the operator console', async () => {
    const venueUser = await harness.client();
    await venueUser
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);

    await venueUser.get('/api/system/users').expect(401);
    await venueUser.get(`/api/system/venues/${venue.venueId}/users`).expect(401);
  });
});
