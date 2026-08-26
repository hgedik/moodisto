import { SettingKey } from '@moodisto/validation';
import type { EffectiveSettings } from './settings-resolver';

/**
 * The combinations a live installation must never be left in.
 *
 * Pure on purpose: the same rule answers for a save from the panel and for a configuration read at
 * boot, and it can be read without a database or a request in the way.
 */
export const settingsViolations = (settings: EffectiveSettings): readonly string[] => {
  const violations: string[] = [];

  if (settings.payment.provider === 'mock' && settings.features.paidRequests) {
    violations.push(
      `${SettingKey.PAYMENT_PROVIDER}: sahte ödeme sağlayıcısı açıkken ücretli istekler açılamaz.`,
    );
  }
  if (!settings.music.useFakeProvider && settings.music.youtubeApiKey.length === 0) {
    violations.push(
      `${SettingKey.YOUTUBE_API_KEY}: gerçek müzik sağlayıcısı seçiliyken anahtar boş bırakılamaz.`,
    );
  }

  return violations;
};
