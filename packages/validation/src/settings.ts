import { z } from 'zod';

/**
 * The settings an operator may change without a deploy.
 *
 * Infrastructure variables (`DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `APP_URL`, …) are
 * deliberately absent: the process cannot start without them, so a panel could never be the place
 * that decides them. What is left here are the integration credentials and the feature switches
 * an evening may need to survive.
 */

export const SettingKey = {
  MUSIC_PROVIDER_FAKE: 'MUSIC_PROVIDER_FAKE',
  YOUTUBE_API_KEY: 'YOUTUBE_API_KEY',
  YOUTUBE_REGION_CODE: 'YOUTUBE_REGION_CODE',
  YOUTUBE_RELEVANCE_LANGUAGE: 'YOUTUBE_RELEVANCE_LANGUAGE',
  PAYMENT_PROVIDER: 'PAYMENT_PROVIDER',
  PAYMENT_API_KEY: 'PAYMENT_API_KEY',
  PAYMENT_SECRET: 'PAYMENT_SECRET',
  PAYMENT_BASE_URL: 'PAYMENT_BASE_URL',
  PAYMENT_WEBHOOK_SECRET: 'PAYMENT_WEBHOOK_SECRET',
  ENABLE_PAID_REQUESTS: 'ENABLE_PAID_REQUESTS',
  ENABLE_YOUTUBE_PLAYBACK: 'ENABLE_YOUTUBE_PLAYBACK',
  RATE_LIMIT_ENABLED: 'RATE_LIMIT_ENABLED',
} as const;
export type SettingKey = (typeof SettingKey)[keyof typeof SettingKey];

export const SettingGroup = {
  MUSIC: 'music',
  PAYMENT: 'payment',
  FEATURES: 'features',
} as const;
export type SettingGroup = (typeof SettingGroup)[keyof typeof SettingGroup];

export const SettingKind = {
  STRING: 'string',
  BOOLEAN: 'boolean',
  ENUM: 'enum',
} as const;
export type SettingKind = (typeof SettingKind)[keyof typeof SettingKind];

export type SettingValue = string | boolean;

export interface SettingDescriptor {
  readonly key: SettingKey;
  readonly group: SettingGroup;
  readonly kind: SettingKind;
  /** Never leaves the server in plain text, not even to the panel that wrote it. */
  readonly secret: boolean;
  /** Validates and normalises both panel input and text read back out of the database. */
  readonly schema: z.ZodType<SettingValue, z.ZodTypeDef, unknown>;
  readonly enumValues?: readonly string[];
}

const TRUTHY = ['1', 'true', 'yes', 'on'];

const booleanValue = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : TRUTHY.includes(value.trim().toLowerCase()),
  ) as unknown as z.ZodType<SettingValue, z.ZodTypeDef, unknown>;

const text = (schema: z.ZodType<string, z.ZodTypeDef, unknown>) =>
  schema as unknown as z.ZodType<SettingValue, z.ZodTypeDef, unknown>;

const PAYMENT_PROVIDERS = ['iyzico', 'mock'] as const;

const MAX_CREDENTIAL_LENGTH = 512;

const descriptor = (value: SettingDescriptor): SettingDescriptor => Object.freeze(value);

export const SETTING_DESCRIPTORS: Readonly<Record<SettingKey, SettingDescriptor>> = Object.freeze({
  [SettingKey.MUSIC_PROVIDER_FAKE]: descriptor({
    key: SettingKey.MUSIC_PROVIDER_FAKE,
    group: SettingGroup.MUSIC,
    kind: SettingKind.BOOLEAN,
    secret: false,
    schema: booleanValue,
  }),
  [SettingKey.YOUTUBE_API_KEY]: descriptor({
    key: SettingKey.YOUTUBE_API_KEY,
    group: SettingGroup.MUSIC,
    kind: SettingKind.STRING,
    secret: true,
    schema: text(z.string().trim().min(1).max(MAX_CREDENTIAL_LENGTH)),
  }),
  [SettingKey.YOUTUBE_REGION_CODE]: descriptor({
    key: SettingKey.YOUTUBE_REGION_CODE,
    group: SettingGroup.MUSIC,
    kind: SettingKind.STRING,
    secret: false,
    schema: text(
      z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
    ),
  }),
  [SettingKey.YOUTUBE_RELEVANCE_LANGUAGE]: descriptor({
    key: SettingKey.YOUTUBE_RELEVANCE_LANGUAGE,
    group: SettingGroup.MUSIC,
    kind: SettingKind.STRING,
    secret: false,
    schema: text(
      z
        .string()
        .trim()
        .min(2)
        .max(5)
        .transform((value) => value.toLowerCase()),
    ),
  }),
  [SettingKey.PAYMENT_PROVIDER]: descriptor({
    key: SettingKey.PAYMENT_PROVIDER,
    group: SettingGroup.PAYMENT,
    kind: SettingKind.ENUM,
    secret: false,
    schema: text(z.enum(PAYMENT_PROVIDERS)),
    enumValues: PAYMENT_PROVIDERS,
  }),
  [SettingKey.PAYMENT_API_KEY]: descriptor({
    key: SettingKey.PAYMENT_API_KEY,
    group: SettingGroup.PAYMENT,
    kind: SettingKind.STRING,
    secret: true,
    schema: text(z.string().trim().min(1).max(MAX_CREDENTIAL_LENGTH)),
  }),
  [SettingKey.PAYMENT_SECRET]: descriptor({
    key: SettingKey.PAYMENT_SECRET,
    group: SettingGroup.PAYMENT,
    kind: SettingKind.STRING,
    secret: true,
    schema: text(z.string().trim().min(1).max(MAX_CREDENTIAL_LENGTH)),
  }),
  [SettingKey.PAYMENT_BASE_URL]: descriptor({
    key: SettingKey.PAYMENT_BASE_URL,
    group: SettingGroup.PAYMENT,
    kind: SettingKind.STRING,
    secret: false,
    schema: text(z.string().trim().url()),
  }),
  [SettingKey.PAYMENT_WEBHOOK_SECRET]: descriptor({
    key: SettingKey.PAYMENT_WEBHOOK_SECRET,
    group: SettingGroup.PAYMENT,
    kind: SettingKind.STRING,
    secret: true,
    schema: text(z.string().trim().min(1).max(MAX_CREDENTIAL_LENGTH)),
  }),
  [SettingKey.ENABLE_PAID_REQUESTS]: descriptor({
    key: SettingKey.ENABLE_PAID_REQUESTS,
    group: SettingGroup.FEATURES,
    kind: SettingKind.BOOLEAN,
    secret: false,
    schema: booleanValue,
  }),
  [SettingKey.ENABLE_YOUTUBE_PLAYBACK]: descriptor({
    key: SettingKey.ENABLE_YOUTUBE_PLAYBACK,
    group: SettingGroup.FEATURES,
    kind: SettingKind.BOOLEAN,
    secret: false,
    schema: booleanValue,
  }),
  [SettingKey.RATE_LIMIT_ENABLED]: descriptor({
    key: SettingKey.RATE_LIMIT_ENABLED,
    group: SettingGroup.FEATURES,
    kind: SettingKind.BOOLEAN,
    secret: false,
    schema: booleanValue,
  }),
});

/** Catalogue order, which is also the order the panel renders. */
export const SETTING_KEYS: readonly SettingKey[] = Object.freeze(
  Object.keys(SETTING_DESCRIPTORS) as SettingKey[],
);

export const isSettingKey = (value: string): value is SettingKey =>
  Object.prototype.hasOwnProperty.call(SETTING_DESCRIPTORS, value);

export const settingKeySchema = z
  .string()
  .refine(isSettingKey, 'Bilinmeyen ayar anahtarı.')
  .transform((value) => value as SettingKey);

/** Reads a stored value back. Returns null when the text no longer satisfies the catalogue. */
export const parseSettingText = (key: SettingKey, text: string): SettingValue | null => {
  const parsed = SETTING_DESCRIPTORS[key].schema.safeParse(text);
  return parsed.success ? parsed.data : null;
};

export const serializeSettingValue = (value: SettingValue): string =>
  typeof value === 'boolean' ? String(value) : value;

export interface SystemSettingsUpdate {
  readonly values: Readonly<Partial<Record<SettingKey, SettingValue>>>;
  readonly clear: readonly SettingKey[];
}

/**
 * A partial update. An omitted key is left alone — which is what an empty secret box means —
 * so removing a value is a deliberate `clear`, never a side effect of saving the form.
 */
export const updateSystemSettingsSchema = z
  .object({
    values: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
    clear: z.array(settingKeySchema).default([]),
  })
  .superRefine((body, ctx) => {
    if (Object.keys(body.values).length === 0 && body.clear.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'En az bir ayar gönderilmeli.' });
    }
    for (const [key, raw] of Object.entries(body.values)) {
      if (!isSettingKey(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', key],
          message: 'Bilinmeyen ayar anahtarı.',
        });
        continue;
      }
      const parsed = SETTING_DESCRIPTORS[key].schema.safeParse(raw);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['values', key],
          message: parsed.error.issues[0]?.message ?? 'Geçersiz ayar değeri.',
        });
      }
    }
  })
  .transform((body): SystemSettingsUpdate => {
    const values: Partial<Record<SettingKey, SettingValue>> = {};
    for (const [key, raw] of Object.entries(body.values)) {
      if (isSettingKey(key)) {
        const parsed = SETTING_DESCRIPTORS[key].schema.safeParse(raw);
        if (parsed.success) {
          values[key] = parsed.data;
        }
      }
    }
    return { values, clear: body.clear };
  });

export const systemLoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});
export type SystemLoginInput = z.infer<typeof systemLoginSchema>;
