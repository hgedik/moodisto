import type { SystemSettingDto } from '@moodisto/shared-types';
import { SETTING_DESCRIPTORS, SETTING_KEYS, type SettingKey } from '@moodisto/validation';
import { secretPreview } from './secret-preview';
import type { EffectiveSettings } from './settings-resolver';

/** When each stored key was last written, or null for a key nobody has written. */
export type WrittenAt = (key: SettingKey) => Date | null;

const asText = (value: string | boolean): string =>
  typeof value === 'string' ? value : String(value);

/**
 * Turns the effective configuration into what the panel is allowed to see.
 *
 * A secret leaves as `hasValue` plus a masked tail and nothing else — the plain text stays on this
 * side of the wire even for the operator who wrote it.
 */
export const toSystemSettingDtos = (
  settings: EffectiveSettings,
  writtenAt: WrittenAt,
): readonly SystemSettingDto[] =>
  SETTING_KEYS.map((key): SystemSettingDto => {
    const descriptor = SETTING_DESCRIPTORS[key];
    const resolved = settings.entryFor(key);
    const text = asText(resolved.value);
    const stamp = writtenAt(key);

    return {
      key,
      group: descriptor.group,
      kind: descriptor.kind,
      secret: descriptor.secret,
      source: resolved.source,
      value: descriptor.secret ? null : resolved.value,
      hasValue: text.length > 0,
      preview: descriptor.secret ? secretPreview(text) : null,
      enumValues: descriptor.enumValues ? [...descriptor.enumValues] : null,
      updatedAt: stamp?.toISOString() ?? null,
    };
  });
