'use client';

import { useEffect, useState } from 'react';
import type { RequestTypeOptionDto, VenueDetailDto, VenuePricingDto } from '@moodisto/shared-types';
import { errorMessage } from '@/lib/api-client';
import { venueApi } from '@/lib/endpoints';
import { canEditVenue, formatMoney, requestTypeHint, requestTypeLabel } from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import { useVenueSession } from '@/lib/venue-session';
import { Button, Card, Field, Input, Notice, PageHeader, Spinner, Textarea } from '@/components/ui';

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function VenueSettingsPage() {
  const { user } = useVenueSession();
  const editable = canEditVenue(user.role);
  const settings = useResource((signal) => venueApi.settings(signal), []);
  const pricing = useResource((signal) => venueApi.pricing(signal), []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ayarlar"
        subtitle={editable ? undefined : 'Bu rol ayarları görüntüleyebilir, değiştiremez.'}
      />
      {settings.error ? <Notice>{settings.error}</Notice> : null}
      {settings.loading || !settings.data ? (
        <Spinner />
      ) : (
        <VenueForm venue={settings.data} editable={editable} onSaved={settings.setData} />
      )}

      {pricing.error ? <Notice>{pricing.error}</Notice> : null}
      {pricing.loading || !pricing.data ? (
        <Spinner />
      ) : (
        <PricingForm pricing={pricing.data} editable={editable} onSaved={pricing.setData} />
      )}
    </div>
  );
}

function VenueForm({
  venue,
  editable,
  onSaved,
}: {
  venue: VenueDetailDto;
  editable: boolean;
  onSaved: (value: VenueDetailDto) => void;
}) {
  const [form, setForm] = useState(venue);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(venue), [venue]);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      // Every editable field is sent back, so nothing the form did not show gets cleared.
      const saved = await venueApi.updateSettings({
        name: form.name,
        description: form.description,
        address: form.address,
        timezone: form.timezone,
        latitude: form.latitude,
        longitude: form.longitude,
        logoUrl: form.logoUrl,
        active: form.active,
      });
      onSaved(saved);
      setStatus('Ayarlar kaydedildi.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Mekân bilgisi</h2>

        <Field label="Mekân adı">
          <Input
            required
            minLength={2}
            maxLength={120}
            disabled={!editable}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <Field label="Açıklama">
          <Textarea
            maxLength={500}
            disabled={!editable}
            value={form.description ?? ''}
            onChange={(event) => setForm({ ...form, description: event.target.value || null })}
          />
        </Field>

        <Field label="Adres">
          <Input
            maxLength={300}
            disabled={!editable}
            value={form.address ?? ''}
            onChange={(event) => setForm({ ...form, address: event.target.value || null })}
          />
        </Field>

        <Field label="Saat dilimi" hint="Örneğin: Europe/Istanbul">
          <Input
            required
            minLength={3}
            maxLength={64}
            disabled={!editable}
            value={form.timezone}
            onChange={(event) => setForm({ ...form, timezone: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Enlem" hint="Yakındaki mekânlar listesi için">
            <Input
              inputMode="decimal"
              disabled={!editable}
              value={form.latitude === null ? '' : String(form.latitude)}
              onChange={(event) => setForm({ ...form, latitude: numberOrNull(event.target.value) })}
            />
          </Field>
          <Field label="Boylam">
            <Input
              inputMode="decimal"
              disabled={!editable}
              value={form.longitude === null ? '' : String(form.longitude)}
              onChange={(event) =>
                setForm({ ...form, longitude: numberOrNull(event.target.value) })
              }
            />
          </Field>
        </div>

        <Field label="Logo adresi">
          <Input
            type="url"
            maxLength={500}
            disabled={!editable}
            value={form.logoUrl ?? ''}
            onChange={(event) => setForm({ ...form, logoUrl: event.target.value || null })}
          />
        </Field>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand-500"
            disabled={!editable}
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          <span>Mekân istek almaya açık</span>
        </label>

        {error ? <Notice>{error}</Notice> : null}
        {status ? <Notice tone="success">{status}</Notice> : null}

        {editable ? (
          <Button type="submit" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}

function PricingForm({
  pricing,
  editable,
  onSaved,
}: {
  pricing: VenuePricingDto;
  editable: boolean;
  onSaved: (value: VenuePricingDto) => void;
}) {
  const [form, setForm] = useState(pricing);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(pricing), [pricing]);

  const patchOption = (type: string, patch: Partial<RequestTypeOptionDto>): void => {
    setForm({
      ...form,
      options: form.options.map((option) =>
        option.type === type ? { ...option, ...patch } : option,
      ),
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await venueApi.updatePricing({
        currency: form.currency,
        duplicateCooldownMinutes: form.duplicateCooldownMinutes,
        options: form.options.map((option) => ({
          type: option.type,
          enabled: option.enabled,
          priceMinor: option.priceMinor,
        })),
      });
      onSaved(saved);
      setStatus('Fiyatlandırma kaydedildi.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Fiyatlandırma</h2>
        <p className="text-xs text-muted">
          Tutarlar kuruş cinsindendir: 2000 kuruş = {formatMoney(2000, form.currency)}.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Para birimi" hint="Üç harfli kod, örneğin TRY">
            <Input
              required
              maxLength={3}
              minLength={3}
              disabled={!editable}
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Aynı şarkı bekleme süresi (dk)">
            <Input
              type="number"
              min={0}
              max={1440}
              disabled={!editable}
              value={form.duplicateCooldownMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  duplicateCooldownMinutes: Number.parseInt(event.target.value, 10) || 0,
                })
              }
            />
          </Field>
        </div>

        <ul className="space-y-3">
          {form.options.map((option) => (
            <li
              key={option.type}
              className="space-y-2 rounded-xl border border-white/8 bg-white/4 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{requestTypeLabel[option.type]}</p>
                  <p className="text-xs text-muted">{requestTypeHint[option.type]}</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand-500"
                    disabled={!editable}
                    checked={option.enabled}
                    onChange={(event) =>
                      patchOption(option.type, { enabled: event.target.checked })
                    }
                  />
                  Açık
                </label>
              </div>
              <Field label="Tutar (kuruş)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!editable}
                  value={option.priceMinor}
                  onChange={(event) =>
                    patchOption(option.type, {
                      priceMinor: Number.parseInt(event.target.value, 10) || 0,
                    })
                  }
                />
              </Field>
              <p className="text-xs text-brand-300">
                {formatMoney(option.priceMinor, form.currency)}
              </p>
            </li>
          ))}
        </ul>

        {error ? <Notice>{error}</Notice> : null}
        {status ? <Notice tone="success">{status}</Notice> : null}

        {editable ? (
          <Button type="submit" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Fiyatlandırmayı kaydet'}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
