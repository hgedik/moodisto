import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const csvList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(z.string().url()).min(1));

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: csvList.default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),

  COOKIE_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  SETTINGS_ENCRYPTION_KEY: z.string().min(32).optional(),

  MUSIC_PROVIDER: z.literal('YOUTUBE').default('YOUTUBE'),
  MUSIC_PROVIDER_FAKE: booleanFromEnv.default(false),
  YOUTUBE_API_KEY: z.string().default(''),
  YOUTUBE_REGION_CODE: z.string().length(2).default('TR'),
  YOUTUBE_RELEVANCE_LANGUAGE: z.string().min(2).max(5).default('tr'),

  PAYMENT_PROVIDER: z.enum(['iyzico', 'mock']).default('mock'),
  PAYMENT_API_KEY: z.string().default(''),
  PAYMENT_SECRET: z.string().default(''),
  PAYMENT_BASE_URL: z.string().url().default('https://sandbox-api.iyzipay.com'),
  PAYMENT_WEBHOOK_SECRET: z.string().default(''),

  ENABLE_PAID_REQUESTS: booleanFromEnv.default(true),
  ENABLE_YOUTUBE_PLAYBACK: booleanFromEnv.default(true),
  RATE_LIMIT_ENABLED: booleanFromEnv.default(true),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly isProduction: boolean;
  readonly port: number;
  readonly appUrl: string;
  readonly apiUrl: string;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly cookieSecret: string;
  /** Encrypts the credentials stored in `system_settings`; never derived from them. */
  readonly settingsEncryptionKey: string;
  readonly jwt: {
    readonly secret: string;
    readonly accessTtlSeconds: number;
    readonly refreshTtlSeconds: number;
  };
  readonly music: {
    readonly providerId: 'YOUTUBE';
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
}

export class InvalidConfigurationError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidConfigurationError';
  }
}

export function loadAppConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    throw new InvalidConfigurationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  // Combinations of integration settings are judged where they are now entered — the system
  // panel — because the database may well answer for them instead of this file. See
  // `settings/settings-rules.ts`.
  if (isProduction && env.SETTINGS_ENCRYPTION_KEY === undefined) {
    throw new InvalidConfigurationError([
      'SETTINGS_ENCRYPTION_KEY: required in production to encrypt stored credentials',
    ]);
  }

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    port: env.API_PORT,
    appUrl: env.APP_URL,
    apiUrl: env.API_URL,
    corsOrigins: Object.freeze([...env.CORS_ORIGINS]),
    databaseUrl: env.DATABASE_URL,
    cookieSecret: env.COOKIE_SECRET,
    // Outside production a missing key must not stop the app; it is derived from the signing
    // secret instead, which keeps developer databases readable only by that same checkout.
    settingsEncryptionKey: env.SETTINGS_ENCRYPTION_KEY ?? `${env.JWT_SECRET}:system-settings`,
    jwt: {
      secret: env.JWT_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    },
    music: {
      providerId: env.MUSIC_PROVIDER,
      useFakeProvider: env.MUSIC_PROVIDER_FAKE,
      youtubeApiKey: env.YOUTUBE_API_KEY,
      youtubeRegionCode: env.YOUTUBE_REGION_CODE,
      youtubeRelevanceLanguage: env.YOUTUBE_RELEVANCE_LANGUAGE,
    },
    payment: {
      provider: env.PAYMENT_PROVIDER,
      apiKey: env.PAYMENT_API_KEY,
      secret: env.PAYMENT_SECRET,
      baseUrl: env.PAYMENT_BASE_URL,
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
    },
    features: {
      paidRequests: env.ENABLE_PAID_REQUESTS,
      youtubePlayback: env.ENABLE_YOUTUBE_PLAYBACK,
      rateLimit: env.RATE_LIMIT_ENABLED,
    },
  };
}
