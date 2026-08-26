import { describe, expect, it } from 'vitest';
import { SettingKey } from '@moodisto/validation';
import {
  environmentFallback,
  resolveSettings,
  type SettingsFallback,
} from '../../src/settings/settings-resolver';
import { loadAppConfig } from '../../src/config/app-config';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost:5432/moodisto_test',
  COOKIE_SECRET: 'cookie-secret-value-32-characters',
  JWT_SECRET: 'jwt-secret-value-32-characters!!',
} satisfies NodeJS.ProcessEnv;

const fallbackFrom = (env: NodeJS.ProcessEnv): SettingsFallback =>
  environmentFallback(loadAppConfig(env), env);

describe('effective settings', () => {
  it('falls back to the schema default when neither the database nor the environment decides', () => {
    const settings = resolveSettings({}, fallbackFrom(baseEnv));

    expect(settings.music.youtubeRegionCode).toBe('TR');
    expect(settings.entryFor(SettingKey.YOUTUBE_REGION_CODE)).toMatchObject({
      value: 'TR',
      source: 'default',
    });
  });

  it('prefers the environment over the schema default', () => {
    const settings = resolveSettings({}, fallbackFrom({ ...baseEnv, YOUTUBE_REGION_CODE: 'DE' }));

    expect(settings.music.youtubeRegionCode).toBe('DE');
    expect(settings.entryFor(SettingKey.YOUTUBE_REGION_CODE).source).toBe('environment');
  });

  it('prefers the database over both', () => {
    const settings = resolveSettings(
      { [SettingKey.YOUTUBE_REGION_CODE]: 'GB' },
      fallbackFrom({ ...baseEnv, YOUTUBE_REGION_CODE: 'DE' }),
    );

    expect(settings.music.youtubeRegionCode).toBe('GB');
    expect(settings.entryFor(SettingKey.YOUTUBE_REGION_CODE).source).toBe('database');
  });

  it('reads booleans and enums back out of their stored text', () => {
    const settings = resolveSettings(
      {
        [SettingKey.MUSIC_PROVIDER_FAKE]: 'true',
        [SettingKey.RATE_LIMIT_ENABLED]: 'false',
        [SettingKey.PAYMENT_PROVIDER]: 'iyzico',
      },
      fallbackFrom(baseEnv),
    );

    expect(settings.music.useFakeProvider).toBe(true);
    expect(settings.features.rateLimit).toBe(false);
    expect(settings.payment.provider).toBe('iyzico');
  });

  it('ignores a stored value the catalogue rejects instead of failing the whole read', () => {
    // A row written by hand, or one whose ciphertext could not be decrypted.
    const settings = resolveSettings(
      { [SettingKey.PAYMENT_PROVIDER]: 'stripe', [SettingKey.YOUTUBE_REGION_CODE]: 'GB' },
      fallbackFrom(baseEnv),
    );

    expect(settings.payment.provider).toBe('mock');
    expect(settings.entryFor(SettingKey.PAYMENT_PROVIDER).source).toBe('default');
    expect(settings.music.youtubeRegionCode).toBe('GB');
  });

  it('lists every catalogue key exactly once', () => {
    const settings = resolveSettings({}, fallbackFrom(baseEnv));
    const keys = settings.entries.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(SettingKey.PAYMENT_WEBHOOK_SECRET);
  });
});
