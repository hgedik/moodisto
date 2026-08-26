import { describe, expect, it } from 'vitest';
import { SettingKey } from '@moodisto/validation';
import { environmentFallback, resolveSettings } from '../../src/settings/settings-resolver';
import { toSystemSettingDtos } from '../../src/settings/settings-view';
import { testAppConfig } from './support/app-config';

const writtenAt = new Date('2026-08-27T10:00:00.000Z');

const view = (stored: Partial<Record<SettingKey, string>>) =>
  toSystemSettingDtos(resolveSettings(stored, environmentFallback(testAppConfig(), {})), (key) =>
    key in stored ? writtenAt : null,
  );

const rowFor = (
  dtos: ReturnType<typeof toSystemSettingDtos>,
  key: SettingKey,
): (typeof dtos)[number] => {
  const row = dtos.find((entry) => entry.key === key);
  if (!row) {
    throw new Error(`beklenen satır yok: ${key}`);
  }
  return row;
};

describe('toSystemSettingDtos', () => {
  it('never sends a secret back, only that it exists and how it ends', () => {
    const rows = view({ [SettingKey.YOUTUBE_API_KEY]: 'AIzaSyExampleKey1234' });

    const row = rowFor(rows, SettingKey.YOUTUBE_API_KEY);
    expect(row.secret).toBe(true);
    expect(row.value).toBeNull();
    expect(row.hasValue).toBe(true);
    expect(row.preview).toBe('••••1234');
    expect(JSON.stringify(rows)).not.toContain('AIzaSyExampleKey1234');
  });

  it('sends an ordinary value as it is, with the place it came from', () => {
    const rows = view({ [SettingKey.YOUTUBE_REGION_CODE]: 'DE' });

    const row = rowFor(rows, SettingKey.YOUTUBE_REGION_CODE);
    expect(row.value).toBe('DE');
    expect(row.source).toBe('database');
    expect(row.updatedAt).toBe(writtenAt.toISOString());
  });

  it('marks a value nobody has written as coming from the schema default', () => {
    const rows = view({});

    const row = rowFor(rows, SettingKey.YOUTUBE_API_KEY);
    expect(row.source).toBe('default');
    expect(row.hasValue).toBe(false);
    expect(row.preview).toBeNull();
    expect(row.updatedAt).toBeNull();
  });

  it('tells the panel which values an enum accepts', () => {
    const rows = view({});

    expect(rowFor(rows, SettingKey.PAYMENT_PROVIDER).enumValues).toEqual(['iyzico', 'mock']);
    expect(rowFor(rows, SettingKey.YOUTUBE_REGION_CODE).enumValues).toBeNull();
  });

  it('describes every key in the catalogue, grouped as the panel renders them', () => {
    const rows = view({});

    expect(rows).toHaveLength(12);
    expect(rowFor(rows, SettingKey.ENABLE_PAID_REQUESTS).group).toBe('features');
    expect(rowFor(rows, SettingKey.PAYMENT_SECRET).group).toBe('payment');
  });
});
