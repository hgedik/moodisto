import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SystemSettingDto, SystemSettingsResponse } from '@moodisto/shared-types';
import { SettingKey } from '@moodisto/validation';
import { createHarness, type Client, type Harness } from './support/harness';
import {
  createSystemUserFixture,
  createVenueFixture,
  SYSTEM_EMAIL,
  SYSTEM_PASSWORD,
  VENUE_PASSWORD,
} from './support/fixtures';

const YOUTUBE_KEY = 'AIzaSyIntegrationKey0001';

const rowFor = (body: SystemSettingsResponse, key: SettingKey): SystemSettingDto => {
  const row = body.settings.find((entry) => entry.key === key);
  if (!row) {
    throw new Error(`beklenen ayar satırı yok: ${key}`);
  }
  return row;
};

/**
 * The settings panel is the only place a credential is entered, and the one place it must never
 * come back out of.
 */
describe('system settings', () => {
  let harness: Harness;
  let systemUserId: string;

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
    systemUserId = await createSystemUserFixture(harness.prisma);
  });

  it('describes every setting, saying where each value comes from', async () => {
    const client = await signIn();

    const response = await client.get('/api/system/settings').expect(200);
    const body = response.body as SystemSettingsResponse;

    expect(body.settings).toHaveLength(12);
    expect(rowFor(body, SettingKey.YOUTUBE_API_KEY).source).not.toBe('database');
  });

  it('keeps a saved credential out of every answer it gives', async () => {
    const client = await signIn();

    const saved = await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_API_KEY]: YOUTUBE_KEY } })
      .expect(200);

    expect(JSON.stringify(saved.body)).not.toContain(YOUTUBE_KEY);
    const row = rowFor(saved.body as SystemSettingsResponse, SettingKey.YOUTUBE_API_KEY);
    expect(row.value).toBeNull();
    expect(row.hasValue).toBe(true);
    expect(row.preview).toBe('••••0001');
    expect(row.source).toBe('database');

    const reread = await client.get('/api/system/settings').expect(200);
    expect(JSON.stringify(reread.body)).not.toContain(YOUTUBE_KEY);
  });

  it('stores a secret encrypted and names the operator who wrote it', async () => {
    const client = await signIn();

    await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_API_KEY]: YOUTUBE_KEY } })
      .expect(200);

    const stored = await harness.prisma.systemSetting.findUniqueOrThrow({
      where: { key: SettingKey.YOUTUBE_API_KEY },
    });
    expect(stored.valueText).toBeNull();
    expect(stored.valueCipher).not.toBeNull();
    expect(stored.valueCipher).not.toContain(YOUTUBE_KEY);
    expect(stored.updatedById).toBe(systemUserId);
  });

  it('normalises what it stores, the way the catalogue says', async () => {
    const client = await signIn();

    const saved = await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_REGION_CODE]: 'de' } })
      .expect(200);

    expect(
      rowFor(saved.body as SystemSettingsResponse, SettingKey.YOUTUBE_REGION_CODE),
    ).toMatchObject({ value: 'DE', source: 'database' });
  });

  it('reaches the running system on the next request, with no restart in between', async () => {
    const venue = await createVenueFixture(harness.prisma);
    const venueClient = await harness.client();
    await venueClient
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);

    const before = await venueClient.get('/api/venue/player/state').expect(200);
    expect(before.body.providerPlaybackEnabled).toBe(true);

    const client = await signIn();
    await client
      .patch('/api/system/settings', { values: { [SettingKey.ENABLE_YOUTUBE_PLAYBACK]: false } })
      .expect(200);

    const after = await venueClient.get('/api/venue/player/state').expect(200);
    expect(after.body.providerPlaybackEnabled).toBe(false);
  });

  it('leaves a value alone when the panel sends nothing for it', async () => {
    const client = await signIn();

    await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_API_KEY]: YOUTUBE_KEY } })
      .expect(200);
    const after = await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_REGION_CODE]: 'FR' } })
      .expect(200);

    expect(rowFor(after.body as SystemSettingsResponse, SettingKey.YOUTUBE_API_KEY).hasValue).toBe(
      true,
    );
  });

  it('falls back to the environment once a value is cleared', async () => {
    const client = await signIn();

    await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_REGION_CODE]: 'FR' } })
      .expect(200);
    const cleared = await client
      .patch('/api/system/settings', { clear: [SettingKey.YOUTUBE_REGION_CODE] })
      .expect(200);

    const row = rowFor(cleared.body as SystemSettingsResponse, SettingKey.YOUTUBE_REGION_CODE);
    expect(row.source).not.toBe('database');
    expect(row.value).not.toBe('FR');
    expect(
      await harness.prisma.systemSetting.findUnique({
        where: { key: SettingKey.YOUTUBE_REGION_CODE },
      }),
    ).toBeNull();
  });

  it('refuses a value the catalogue does not accept', async () => {
    const client = await signIn();

    await client
      .patch('/api/system/settings', { values: { [SettingKey.YOUTUBE_REGION_CODE]: 'TURKIYE' } })
      .expect(400);
    await client.patch('/api/system/settings', { values: { NOT_A_SETTING: 'x' } }).expect(400);
  });

  it('is closed to a venue owner, to an anonymous caller and to a request without CSRF', async () => {
    const venue = await createVenueFixture(harness.prisma);
    const venueClient = await harness.client();
    await venueClient
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);

    await venueClient.get('/api/system/settings').expect(401);
    await (await harness.client()).get('/api/system/settings').expect(401);

    const client = await signIn();
    const noCsrf = await client.agent
      .patch('/api/system/settings')
      .send({ values: { [SettingKey.YOUTUBE_REGION_CODE]: 'FR' } });
    expect(noCsrf.status).toBe(403);
  });
});
