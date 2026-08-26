import { describe, expect, it } from 'vitest';
import {
  SETTING_DESCRIPTORS,
  SETTING_KEYS,
  SettingKey,
  parseSettingText,
  serializeSettingValue,
  updateSystemSettingsSchema,
} from '@moodisto/validation';

describe('settings catalogue', () => {
  it('marks every credential as a secret', () => {
    const secrets = SETTING_KEYS.filter((key) => SETTING_DESCRIPTORS[key].secret);

    expect(secrets).toEqual([
      SettingKey.YOUTUBE_API_KEY,
      SettingKey.PAYMENT_API_KEY,
      SettingKey.PAYMENT_SECRET,
      SettingKey.PAYMENT_WEBHOOK_SECRET,
    ]);
  });

  it('round-trips a value through its stored text', () => {
    expect(parseSettingText(SettingKey.MUSIC_PROVIDER_FAKE, serializeSettingValue(true))).toBe(
      true,
    );
    expect(parseSettingText(SettingKey.MUSIC_PROVIDER_FAKE, serializeSettingValue(false))).toBe(
      false,
    );
    expect(parseSettingText(SettingKey.YOUTUBE_REGION_CODE, 'de')).toBe('DE');
    expect(parseSettingText(SettingKey.PAYMENT_BASE_URL, 'not-a-url')).toBeNull();
  });

  it('accepts a partial update and normalises what it accepts', () => {
    const parsed = updateSystemSettingsSchema.parse({
      values: {
        [SettingKey.YOUTUBE_REGION_CODE]: ' de ',
        [SettingKey.ENABLE_PAID_REQUESTS]: false,
      },
      clear: [SettingKey.PAYMENT_API_KEY],
    });

    expect(parsed.values[SettingKey.YOUTUBE_REGION_CODE]).toBe('DE');
    expect(parsed.values[SettingKey.ENABLE_PAID_REQUESTS]).toBe(false);
    expect(parsed.clear).toEqual([SettingKey.PAYMENT_API_KEY]);
  });

  it('refuses an unknown key, an invalid value and an empty update', () => {
    expect(updateSystemSettingsSchema.safeParse({ values: { NOPE: 'x' } }).success).toBe(false);
    expect(
      updateSystemSettingsSchema.safeParse({ values: { [SettingKey.PAYMENT_PROVIDER]: 'stripe' } })
        .success,
    ).toBe(false);
    expect(updateSystemSettingsSchema.safeParse({}).success).toBe(false);
    expect(updateSystemSettingsSchema.safeParse({ values: {}, clear: [] }).success).toBe(false);
  });

  it('refuses to blank a secret through the value channel', () => {
    // Clearing is a deliberate, separate action; an empty box means "leave it alone".
    expect(
      updateSystemSettingsSchema.safeParse({ values: { [SettingKey.YOUTUBE_API_KEY]: '' } })
        .success,
    ).toBe(false);
  });
});
