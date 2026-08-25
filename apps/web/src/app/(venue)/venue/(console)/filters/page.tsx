'use client';

import { useState } from 'react';
import { BlockedRuleType } from '@moodisto/shared-types';
import { MAX_BLOCKED_RULE_VALUE_LENGTH } from '@moodisto/validation';
import { errorMessage } from '@/lib/api-client';
import { venueApi } from '@/lib/endpoints';
import { blockedRuleTypeLabel, formatDateTime } from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui';

const hints: Record<BlockedRuleType, string> = {
  [BlockedRuleType.TRACK]: 'Sağlayıcıdaki parça kimliği. Yalnızca o parça engellenir.',
  [BlockedRuleType.CHANNEL]: 'Sağlayıcıdaki kanal kimliği. O kanalın tüm parçaları engellenir.',
  [BlockedRuleType.KEYWORD]: 'Başlıkta geçen kelime. Eşleşen tüm istekler reddedilir.',
};

export default function VenueFiltersPage() {
  const rules = useResource((signal) => venueApi.filters(signal), []);
  const [type, setType] = useState<BlockedRuleType>(BlockedRuleType.KEYWORD);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setRules = rules.setData;

  const add = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await venueApi.createFilter({ type, value: value.trim() });
      setRules([created, ...(rules.data ?? [])]);
      setValue('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ruleId: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await venueApi.removeFilter(ruleId);
      setRules((rules.data ?? []).filter((rule) => rule.id !== ruleId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Filtreler"
        subtitle="Engellenen parça, kanal ve kelimeler istek aşamasında reddedilir."
      />

      <Card>
        <form className="space-y-4" onSubmit={(event) => void add(event)}>
          <Field label="Filtre türü" hint={hints[type]}>
            <Select
              value={type}
              onChange={(event) => setType(event.target.value as BlockedRuleType)}
            >
              {Object.values(BlockedRuleType).map((option) => (
                <option key={option} value={option}>
                  {blockedRuleTypeLabel[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Değer">
            <Input
              required
              maxLength={MAX_BLOCKED_RULE_VALUE_LENGTH}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={type === BlockedRuleType.KEYWORD ? 'Örneğin: küfür' : 'Kimlik'}
            />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          <Button type="submit" disabled={busy || value.trim().length === 0}>
            {busy ? 'Ekleniyor…' : 'Filtre ekle'}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Tanımlı filtreler
        </h2>
        {rules.loading ? (
          <Spinner />
        ) : (rules.data?.length ?? 0) === 0 ? (
          <EmptyState title="Henüz filtre yok" />
        ) : (
          <ul className="space-y-2">
            {(rules.data ?? []).map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4 p-3"
              >
                <div className="min-w-0">
                  <p className="break-anywhere font-medium text-white">{rule.value}</p>
                  <p className="text-xs text-muted">{formatDateTime(rule.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{blockedRuleTypeLabel[rule.type]}</Badge>
                  <Button variant="danger" disabled={busy} onClick={() => void remove(rule.id)}>
                    Kaldır
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
