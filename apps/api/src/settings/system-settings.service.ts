import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  SETTING_DESCRIPTORS,
  isSettingKey,
  serializeSettingValue,
  type SettingKey,
  type SettingValue,
  type SystemSettingsUpdate,
} from '@moodisto/validation';
import {
  CLOCK,
  DATABASE,
  SECRET_CIPHER,
  type Clock,
  type Database,
  type SecretCipher,
  type SystemSettingRecord,
  type SystemSettingWriteInput,
} from '../application/ports';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import {
  environmentFallback,
  resolveSettings,
  type EffectiveSettings,
  type SettingsFallback,
} from './settings-resolver';

/**
 * How long a snapshot is trusted. Short enough that a second API instance follows a change within
 * seconds, long enough that the hot path — every search, every request — does not query for it.
 */
const SNAPSHOT_TTL_SECONDS = 30;

/**
 * The one place that knows what the system is currently configured to do.
 *
 * Stored rows win over the environment, the environment wins over the schema defaults, and secrets
 * live encrypted at rest. Callers get an immutable snapshot: they never see a half-applied change,
 * and a save is visible to the next caller without a restart.
 */
@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private readonly fallback: SettingsFallback;
  private readonly updatedAt = new Map<SettingKey, Date>();

  private snapshot: EffectiveSettings;
  private refreshedAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<EffectiveSettings> | null = null;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() environment?: NodeJS.ProcessEnv,
  ) {
    this.fallback = environmentFallback(config, environment ?? process.env);
    this.snapshot = resolveSettings({}, this.fallback);
  }

  /** The effective configuration, re-read from the database once the snapshot goes stale. */
  async effective(): Promise<EffectiveSettings> {
    const now = this.clock.now().getTime();
    if (now - this.refreshedAt < SNAPSHOT_TTL_SECONDS * 1000) {
      return this.snapshot;
    }
    if (!this.inFlight) {
      this.inFlight = this.load().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /**
   * The last snapshot, without touching the database. For the few callers that cannot await —
   * a provider's declared quota, for instance — where being one refresh behind is harmless.
   */
  current(): EffectiveSettings {
    return this.snapshot;
  }

  /** When each stored key was last written, for the panel to show. */
  writtenAt(key: SettingKey): Date | null {
    return this.updatedAt.get(key) ?? null;
  }

  /**
   * Applies a partial update in one transaction and adopts the result immediately, so the very
   * next request already behaves the new way.
   */
  async update(update: SystemSettingsUpdate, actorId: string | null): Promise<EffectiveSettings> {
    const entries = Object.entries(update.values).map(([key, value]) =>
      this.toWriteInput(key as SettingKey, value as SettingValue),
    );
    // Saving and clearing the same key in one call would be ambiguous; the saved value wins.
    const cleared = update.clear.filter((key) => !(key in update.values));

    const rows = await this.database.transaction(async (uow) => {
      if (entries.length > 0) {
        await uow.systemSettings.save(entries, actorId);
      }
      if (cleared.length > 0) {
        await uow.systemSettings.remove(cleared);
      }
      return uow.systemSettings.findAll();
    });

    return this.adopt(rows);
  }

  private toWriteInput(key: SettingKey, value: SettingValue): SystemSettingWriteInput {
    const { secret } = SETTING_DESCRIPTORS[key];
    const text = serializeSettingValue(value);
    return {
      key,
      secret,
      valueText: secret ? null : text,
      valueCipher: secret ? this.cipher.encrypt(text) : null,
    };
  }

  private async load(): Promise<EffectiveSettings> {
    return this.adopt(await this.database.read().systemSettings.findAll());
  }

  private adopt(rows: readonly SystemSettingRecord[]): EffectiveSettings {
    const stored: Partial<Record<SettingKey, string>> = {};
    this.updatedAt.clear();

    for (const row of rows) {
      if (!isSettingKey(row.key)) {
        continue;
      }
      const text = this.plainText(row);
      if (text !== null) {
        stored[row.key] = text;
        this.updatedAt.set(row.key, row.updatedAt);
      }
    }

    this.snapshot = resolveSettings(stored, this.fallback);
    this.refreshedAt = this.clock.now().getTime();
    return this.snapshot;
  }

  /**
   * A row nobody can read must not take the installation down with it: the environment answer is
   * still there, and the panel shows the row as unset so an operator can write it again.
   */
  private plainText(row: SystemSettingRecord): string | null {
    if (!row.secret) {
      return row.valueText;
    }
    if (row.valueCipher === null) {
      return null;
    }
    try {
      return this.cipher.decrypt(row.valueCipher);
    } catch {
      this.logger.error(
        `${row.key} ayarı çözülemedi; SETTINGS_ENCRYPTION_KEY değişmiş olabilir. Ortam değişkeni yedeğine düşülüyor.`,
      );
      return null;
    }
  }
}
