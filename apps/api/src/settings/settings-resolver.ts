import {
  SETTING_KEYS,
  SettingKey,
  parseSettingText,
  type SettingValue,
} from '@moodisto/validation';
import type { AppConfig } from '../config/app-config';

/**
 * Folds the three places a setting can come from into one answer, and remembers which of them
 * won so the panel can say so.
 *
 * Deliberately pure: no Nest, no Prisma, no clock. Everything it needs — the stored rows and the
 * environment fallback — is handed to it already decrypted.
 */

export type SettingSource = 'database' | 'environment' | 'default';

export interface SettingFallback {
  readonly value: SettingValue;
  /** True when the process environment actually set it, false when the schema default applied. */
  readonly fromEnvironment: boolean;
}

export type SettingsFallback = Readonly<Record<SettingKey, SettingFallback>>;

export interface ResolvedSetting {
  readonly key: SettingKey;
  readonly value: SettingValue;
  readonly source: SettingSource;
}

export interface EffectiveSettings {
  readonly music: {
    readonly useFakeProvider: boolean;
    readonly youtubeApiKey: string;
    readonly youtubeRegionCode: string;
    readonly youtubeRelevanceLanguage: string;
  };
  readonly payment: {
    readonly provider: 'iyzico' | 'mock';
    readonly apiKey: string;
    readonly secret: string;
    readonly baseUrl: string;
    readonly webhookSecret: string;
  };
  readonly features: {
    readonly paidRequests: boolean;
    readonly youtubePlayback: boolean;
    readonly rateLimit: boolean;
  };
  readonly entries: readonly ResolvedSetting[];
  entryFor(key: SettingKey): ResolvedSetting;
}

/** What the environment says today, and whether it said it or merely defaulted. */
export const environmentFallback = (
  config: AppConfig,
  source: NodeJS.ProcessEnv = process.env,
): SettingsFallback => {
  const declared = (key: SettingKey): boolean => (source[key] ?? '').trim().length > 0;
  const entry = (key: SettingKey, value: SettingValue): SettingFallback => ({
    value,
    fromEnvironment: declared(key),
  });

  return Object.freeze({
    [SettingKey.MUSIC_PROVIDER_FAKE]: entry(
      SettingKey.MUSIC_PROVIDER_FAKE,
      config.music.useFakeProvider,
    ),
    [SettingKey.YOUTUBE_API_KEY]: entry(SettingKey.YOUTUBE_API_KEY, config.music.youtubeApiKey),
    [SettingKey.YOUTUBE_REGION_CODE]: entry(
      SettingKey.YOUTUBE_REGION_CODE,
      config.music.youtubeRegionCode,
    ),
    [SettingKey.YOUTUBE_RELEVANCE_LANGUAGE]: entry(
      SettingKey.YOUTUBE_RELEVANCE_LANGUAGE,
      config.music.youtubeRelevanceLanguage,
    ),
    [SettingKey.PAYMENT_PROVIDER]: entry(SettingKey.PAYMENT_PROVIDER, config.payment.provider),
    [SettingKey.PAYMENT_API_KEY]: entry(SettingKey.PAYMENT_API_KEY, config.payment.apiKey),
    [SettingKey.PAYMENT_SECRET]: entry(SettingKey.PAYMENT_SECRET, config.payment.secret),
    [SettingKey.PAYMENT_BASE_URL]: entry(SettingKey.PAYMENT_BASE_URL, config.payment.baseUrl),
    [SettingKey.PAYMENT_WEBHOOK_SECRET]: entry(
      SettingKey.PAYMENT_WEBHOOK_SECRET,
      config.payment.webhookSecret,
    ),
    [SettingKey.ENABLE_PAID_REQUESTS]: entry(
      SettingKey.ENABLE_PAID_REQUESTS,
      config.features.paidRequests,
    ),
    [SettingKey.ENABLE_YOUTUBE_PLAYBACK]: entry(
      SettingKey.ENABLE_YOUTUBE_PLAYBACK,
      config.features.youtubePlayback,
    ),
    [SettingKey.RATE_LIMIT_ENABLED]: entry(
      SettingKey.RATE_LIMIT_ENABLED,
      config.features.rateLimit,
    ),
  });
};

const asText = (value: SettingValue): string => (typeof value === 'string' ? value : String(value));
const asFlag = (value: SettingValue): boolean => value === true || value === 'true';

export const resolveSettings = (
  stored: Readonly<Partial<Record<SettingKey, string>>>,
  fallback: SettingsFallback,
): EffectiveSettings => {
  const resolved = new Map<SettingKey, ResolvedSetting>();

  for (const key of SETTING_KEYS) {
    const text = stored[key];
    // A value the catalogue no longer accepts must not take the whole installation down with it:
    // the environment answer is still there, and the panel will show the row as unset.
    const fromDatabase = text === undefined ? null : parseSettingText(key, text);
    if (fromDatabase !== null) {
      resolved.set(key, { key, value: fromDatabase, source: 'database' });
      continue;
    }
    const environment = fallback[key];
    resolved.set(key, {
      key,
      value: environment.value,
      source: environment.fromEnvironment ? 'environment' : 'default',
    });
  }

  const entryFor = (key: SettingKey): ResolvedSetting => {
    const entry = resolved.get(key);
    if (!entry) {
      throw new Error(`Ayar kataloğunda bulunmayan anahtar: ${key}`);
    }
    return entry;
  };
  const textOf = (key: SettingKey): string => asText(entryFor(key).value);
  const flagOf = (key: SettingKey): boolean => asFlag(entryFor(key).value);

  return Object.freeze({
    music: Object.freeze({
      useFakeProvider: flagOf(SettingKey.MUSIC_PROVIDER_FAKE),
      youtubeApiKey: textOf(SettingKey.YOUTUBE_API_KEY),
      youtubeRegionCode: textOf(SettingKey.YOUTUBE_REGION_CODE),
      youtubeRelevanceLanguage: textOf(SettingKey.YOUTUBE_RELEVANCE_LANGUAGE),
    }),
    payment: Object.freeze({
      provider: textOf(SettingKey.PAYMENT_PROVIDER) as 'iyzico' | 'mock',
      apiKey: textOf(SettingKey.PAYMENT_API_KEY),
      secret: textOf(SettingKey.PAYMENT_SECRET),
      baseUrl: textOf(SettingKey.PAYMENT_BASE_URL),
      webhookSecret: textOf(SettingKey.PAYMENT_WEBHOOK_SECRET),
    }),
    features: Object.freeze({
      paidRequests: flagOf(SettingKey.ENABLE_PAID_REQUESTS),
      youtubePlayback: flagOf(SettingKey.ENABLE_YOUTUBE_PLAYBACK),
      rateLimit: flagOf(SettingKey.RATE_LIMIT_ENABLED),
    }),
    entries: Object.freeze(SETTING_KEYS.map(entryFor)),
    entryFor,
  });
};
