'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SystemSettingDto } from '@moodisto/shared-types';
import { SETTING_KEYS, SettingGroup, isSettingKey } from '@moodisto/validation';
import type { SettingKey, SettingValue } from '@moodisto/validation';
import { errorMessage } from '@/lib/api-client';
import { systemApi } from '@/lib/endpoints';
import {
  formatDateTime,
  settingGroupLabel,
  settingHint,
  settingLabel,
  settingSourceLabel,
  settingSourceTone,
} from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import { Badge, Button, Card, Input, Notice, PageHeader, Select, Spinner } from '@/components/ui';

const GROUPS: readonly SettingGroup[] = [
  SettingGroup.MUSIC,
  SettingGroup.PAYMENT,
  SettingGroup.FEATURES,
];

type Draft = Record<string, SettingValue>;

/**
 * What the form starts with: the value the server reports, except for secrets, which start empty
 * because their plain text never leaves the server. An empty secret box therefore means
 * "leave it alone", and removing one is the separate "Temizle" action.
 */
const draftOf = (rows: readonly SystemSettingDto[]): Draft => {
  const draft: Draft = {};
  for (const row of rows) {
    draft[row.key] = row.secret ? '' : (row.value ?? '');
  }
  return draft;
};

const isChanged = (row: SystemSettingDto, drafted: SettingValue | undefined): boolean => {
  if (drafted === undefined) {
    return false;
  }
  if (row.secret) {
    return typeof drafted === 'string' && drafted.trim().length > 0;
  }
  return drafted !== (row.value ?? '');
};

/** Catalogue order, so the panel reads the same way the settings are documented. */
const catalogueOrder = (rows: readonly SystemSettingDto[]): readonly SystemSettingDto[] =>
  [...rows].sort(
    (left, right) =>
      SETTING_KEYS.indexOf(left.key as SettingKey) - SETTING_KEYS.indexOf(right.key as SettingKey),
  );

export default function SystemSettingsPage() {
  const resource = useResource((signal) => systemApi.settings(signal), []);
  const rows = useMemo(
    () => (resource.data ? catalogueOrder(resource.data.settings) : []),
    [resource.data],
  );

  const [draft, setDraft] = useState<Draft>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(draftOf(rows)), [rows]);

  const dirty = rows.some((row) => isChanged(row, draft[row.key]));

  const apply = async (
    values: Partial<Record<SettingKey, SettingValue>>,
    clear: readonly SettingKey[],
    message: string,
  ): Promise<void> => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await systemApi.updateSettings({ values, clear });
      resource.setData(saved);
      setStatus(message);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values: Partial<Record<SettingKey, SettingValue>> = {};
    for (const row of rows) {
      const drafted = draft[row.key];
      if (isSettingKey(row.key) && isChanged(row, drafted) && drafted !== undefined) {
        values[row.key] = typeof drafted === 'string' ? drafted.trim() : drafted;
      }
    }
    if (Object.keys(values).length === 0) {
      setStatus('Değişen bir ayar yok.');
      return;
    }
    await apply(values, [], 'Ayarlar kaydedildi ve hemen geçerli oldu.');
  };

  const clearRow = async (row: SystemSettingDto): Promise<void> => {
    if (!isSettingKey(row.key)) {
      return;
    }
    await apply({}, [row.key], `${settingLabel[row.key]} temizlendi, yedek kaynağa düşüldü.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sistem ayarları"
        subtitle="Değerler önce veritabanından, yoksa .env dosyasından, o da yoksa varsayılandan okunur. Kaydetmek yeniden başlatma gerektirmez."
      />

      {resource.error ? <Notice>{resource.error}</Notice> : null}
      {resource.loading && rows.length === 0 ? <Spinner /> : null}

      {rows.length > 0 ? (
        <form className="space-y-5" onSubmit={(event) => void save(event)}>
          {GROUPS.map((group) => {
            const groupRows = rows.filter((row) => row.group === group);
            if (groupRows.length === 0) {
              return null;
            }
            return (
              <Card key={group} className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {settingGroupLabel[group]}
                </h2>
                <ul className="space-y-4">
                  {groupRows.map((row) => (
                    <li
                      key={row.key}
                      className="space-y-2 rounded-xl border border-white/8 bg-white/4 p-3"
                    >
                      <SettingRow
                        row={row}
                        value={draft[row.key] ?? ''}
                        disabled={saving}
                        onChange={(value) =>
                          setDraft((current) => ({ ...current, [row.key]: value }))
                        }
                        onClear={() => void clearRow(row)}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}

          {error ? <Notice>{error}</Notice> : null}
          {status ? <Notice tone="success">{status}</Notice> : null}

          <Button type="submit" disabled={saving || !dirty}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function SettingRow({
  row,
  value,
  disabled,
  onChange,
  onClear,
}: {
  row: SystemSettingDto;
  value: SettingValue;
  disabled: boolean;
  onChange: (value: SettingValue) => void;
  onClear: () => void;
}) {
  const key = isSettingKey(row.key) ? row.key : null;
  const label = key ? settingLabel[key] : row.key;
  const hint = key ? settingHint[key] : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white">{label}</p>
          <p className="text-xs text-muted">{row.key}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={settingSourceTone[row.source]}>{settingSourceLabel[row.source]}</Badge>
          {row.source === 'database' ? (
            <Button variant="ghost" type="button" disabled={disabled} onClick={onClear}>
              Temizle
            </Button>
          ) : null}
        </div>
      </div>

      {row.kind === 'boolean' ? (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand-500"
            disabled={disabled}
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>Açık</span>
        </label>
      ) : row.kind === 'enum' ? (
        <Select
          aria-label={label}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        >
          {(row.enumValues ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          aria-label={label}
          type={row.secret ? 'password' : 'text'}
          autoComplete={row.secret ? 'new-password' : 'off'}
          placeholder={row.secret ? (row.preview ?? 'Tanımlı değil') : ''}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {row.secret ? (
        <p className="text-xs text-muted">
          {row.hasValue
            ? `Tanımlı (${row.preview ?? '••••'}). Boş bırakırsan değişmez.`
            : 'Tanımlı değil.'}
        </p>
      ) : null}
      {row.updatedAt ? (
        <p className="text-xs text-muted">Son değişiklik: {formatDateTime(row.updatedAt)}</p>
      ) : null}
    </>
  );
}
