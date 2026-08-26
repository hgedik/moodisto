import { describe, expect, it } from 'vitest';
import { SettingKey } from '@moodisto/validation';
import { settingsViolations } from '../../src/settings/settings-rules';
import { environmentFallback, resolveSettings } from '../../src/settings/settings-resolver';
import { testAppConfig } from './support/app-config';

const settingsWith = (stored: Partial<Record<SettingKey, string>>) =>
  resolveSettings(stored, environmentFallback(testAppConfig(), {}));

/**
 * Combinations that are merely inconvenient while developing become real damage in a venue: guests
 * charged through a mock PSP, or a search box that silently answers from the demo catalogue.
 */
describe('settingsViolations', () => {
  it('accepts a production-shaped configuration', () => {
    const violations = settingsViolations(
      settingsWith({
        [SettingKey.MUSIC_PROVIDER_FAKE]: 'false',
        [SettingKey.YOUTUBE_API_KEY]: 'a-real-key',
        [SettingKey.PAYMENT_PROVIDER]: 'iyzico',
        [SettingKey.ENABLE_PAID_REQUESTS]: 'true',
      }),
    );

    expect(violations).toEqual([]);
  });

  it('refuses to charge guests through the mock provider', () => {
    const violations = settingsViolations(
      settingsWith({
        [SettingKey.MUSIC_PROVIDER_FAKE]: 'true',
        [SettingKey.PAYMENT_PROVIDER]: 'mock',
        [SettingKey.ENABLE_PAID_REQUESTS]: 'true',
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('PAYMENT_PROVIDER');
  });

  it('refuses a live music provider with no key behind it', () => {
    const violations = settingsViolations(
      settingsWith({
        [SettingKey.MUSIC_PROVIDER_FAKE]: 'false',
        [SettingKey.PAYMENT_PROVIDER]: 'iyzico',
        [SettingKey.ENABLE_PAID_REQUESTS]: 'false',
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('YOUTUBE_API_KEY');
  });

  it('accepts the demo catalogue with no key, because nothing is called', () => {
    const violations = settingsViolations(
      settingsWith({
        [SettingKey.MUSIC_PROVIDER_FAKE]: 'true',
        [SettingKey.PAYMENT_PROVIDER]: 'iyzico',
        [SettingKey.ENABLE_PAID_REQUESTS]: 'false',
      }),
    );

    expect(violations).toEqual([]);
  });

  it('reports every problem at once, so one save answers them all', () => {
    const violations = settingsViolations(
      settingsWith({
        [SettingKey.MUSIC_PROVIDER_FAKE]: 'false',
        [SettingKey.PAYMENT_PROVIDER]: 'mock',
        [SettingKey.ENABLE_PAID_REQUESTS]: 'true',
      }),
    );

    expect(violations).toHaveLength(2);
  });
});
