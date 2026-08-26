import { beforeEach, describe, expect, it } from 'vitest';
import { SettingKey } from '@moodisto/validation';
import { AesSecretCipher } from '../../src/infrastructure/services/aes-secret-cipher';
import { SystemSettingsService } from '../../src/settings/system-settings.service';
import { FakeSystemSettingStore } from './support/fake-system-settings';
import { testAppConfig } from './support/app-config';
import { TestClock } from './support/test-clock';

/**
 * The service is what stands between an operator saving a form and the rest of the API changing
 * behaviour, so these tests pin down the two things that matter: what is stored, and how quickly
 * the change is seen.
 */
describe('system settings service', () => {
  const cipher = new AesSecretCipher('unit-test-settings-encryption-key');
  const config = testAppConfig();
  // The environment declares the region code and nothing else, so the remaining rows fall through
  // to the schema defaults and the two sources stay distinguishable.
  const environment = { YOUTUBE_REGION_CODE: 'TR' };
  let clock: TestClock;
  let store: FakeSystemSettingStore;
  let service: SystemSettingsService;

  beforeEach(() => {
    clock = new TestClock();
    store = new FakeSystemSettingStore(() => clock.now());
    service = new SystemSettingsService(store.database, cipher, config, clock, environment);
  });

  it('falls back to the environment while nothing is stored', async () => {
    const settings = await service.effective();

    expect(settings.music.useFakeProvider).toBe(true);
    expect(settings.entryFor(SettingKey.YOUTUBE_REGION_CODE)).toMatchObject({
      value: 'TR',
      source: 'environment',
    });
    expect(settings.entryFor(SettingKey.PAYMENT_BASE_URL).source).toBe('default');
  });

  it('lets a stored value win and reports the database as its source', async () => {
    await service.update({ values: { [SettingKey.YOUTUBE_REGION_CODE]: 'GB' }, clear: [] }, 'op-1');

    const settings = await service.effective();
    expect(settings.music.youtubeRegionCode).toBe('GB');
    expect(settings.entryFor(SettingKey.YOUTUBE_REGION_CODE).source).toBe('database');
    expect(store.savedBy).toBe('op-1');
  });

  it('takes effect immediately, without waiting for the snapshot to go stale', async () => {
    await service.effective();

    await service.update(
      { values: { [SettingKey.MUSIC_PROVIDER_FAKE]: false }, clear: [] },
      'op-1',
    );

    expect(service.current().music.useFakeProvider).toBe(false);
  });

  it('never stores a secret in readable form', async () => {
    await service.update(
      { values: { [SettingKey.YOUTUBE_API_KEY]: 'AIza-super-secret' }, clear: [] },
      'op-1',
    );

    const row = store.rows.get(SettingKey.YOUTUBE_API_KEY);
    expect(row?.valueText).toBeNull();
    expect(row?.secret).toBe(true);
    expect(row?.valueCipher).not.toContain('AIza-super-secret');
    expect((await service.effective()).music.youtubeApiKey).toBe('AIza-super-secret');
  });

  it('drops back to the environment once a value is cleared', async () => {
    await service.update({ values: { [SettingKey.YOUTUBE_REGION_CODE]: 'GB' }, clear: [] }, 'op-1');

    await service.update({ values: {}, clear: [SettingKey.YOUTUBE_REGION_CODE] }, 'op-1');

    const settings = await service.effective();
    expect(settings.music.youtubeRegionCode).toBe('TR');
    expect(settings.entryFor(SettingKey.YOUTUBE_REGION_CODE).source).toBe('environment');
    expect(store.rows.has(SettingKey.YOUTUBE_REGION_CODE)).toBe(false);
  });

  it('serves repeated reads from the snapshot and refreshes it once it goes stale', async () => {
    await service.effective();
    await service.effective();
    expect(store.reads).toBe(1);

    clock.advance(60);
    await service.effective();
    expect(store.reads).toBe(2);
  });

  it('ignores a stored value the catalogue no longer accepts', async () => {
    store.rows.set(SettingKey.YOUTUBE_REGION_CODE, {
      key: SettingKey.YOUTUBE_REGION_CODE,
      valueText: 'not-a-region-code',
      valueCipher: null,
      secret: false,
      updatedById: null,
      updatedAt: clock.now(),
    });

    const settings = await service.effective();
    expect(settings.music.youtubeRegionCode).toBe('TR');
  });

  it('ignores a secret it can no longer decrypt', async () => {
    store.rows.set(SettingKey.YOUTUBE_API_KEY, {
      key: SettingKey.YOUTUBE_API_KEY,
      valueText: null,
      valueCipher: 'not-really-ciphertext',
      secret: true,
      updatedById: null,
      updatedAt: clock.now(),
    });

    const settings = await service.effective();
    expect(settings.music.youtubeApiKey).toBe('');
    expect(settings.entryFor(SettingKey.YOUTUBE_API_KEY).source).toBe('default');
  });
});
