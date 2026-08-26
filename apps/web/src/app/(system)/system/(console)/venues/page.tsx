'use client';

import { useEffect, useState } from 'react';
import type { CreatedVenueDto } from '@moodisto/shared-types';
import { MAX_TABLE_LABEL_LENGTH, slugifyVenueName } from '@moodisto/validation';
import { errorMessage } from '@/lib/api-client';
import { systemApi } from '@/lib/endpoints';
import { useResource } from '@/lib/use-resource';
import { InitialPassword } from '@/components/initial-password';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Spinner,
} from '@/components/ui';

const DEFAULT_TIMEZONE = 'Europe/Istanbul';

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  address: '',
  timezone: DEFAULT_TIMEZONE,
  ownerName: '',
  ownerEmail: '',
  firstTableLabel: '',
};

/** Optional text fields travel as null rather than as an empty string, so the record stays honest. */
const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export default function SystemVenuesPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  /** True once the operator edits the address by hand: the name stops overwriting it from then on. */
  const [slugTouched, setSlugTouched] = useState(false);
  const [created, setCreated] = useState<CreatedVenueDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Typing filters the list without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const venues = useResource((signal) => systemApi.venues(query, signal), [query]);
  const reload = venues.reload;

  const setField = (key: keyof typeof form, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const setName = (value: string): void =>
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugTouched ? current.slug : slugifyVenueName(value),
    }));

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCreated(null);
    try {
      const result = await systemApi.createVenue({
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: orNull(form.description),
        address: orNull(form.address),
        timezone: form.timezone.trim(),
        latitude: null,
        longitude: null,
        logoUrl: null,
        owner: { name: form.ownerName.trim(), email: form.ownerEmail.trim() },
        firstTableLabel: orNull(form.firstTableLabel),
      });
      setCreated(result);
      setForm(emptyForm);
      setSlugTouched(false);
      reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const items = venues.data?.items ?? [];
  const total = venues.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mekânlar"
        subtitle="Yeni bir kafeyi sisteme al, mevcut mekânları düzenle. Mekânlar silinmez, yalnızca pasifleştirilir."
      />

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Yeni mekân</h2>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mekân adı">
              <Input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Örneğin: Kadıköy Kahve"
              />
            </Field>
            <Field label="Adres kısaltması" hint="Misafir bağlantısı: /v/<kısaltma>">
              <Input
                required
                value={form.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setField('slug', event.target.value);
                }}
                placeholder="kadikoy-kahve"
              />
            </Field>
            <Field label="Açıklama (isteğe bağlı)">
              <Input
                maxLength={500}
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
              />
            </Field>
            <Field label="Açık adres (isteğe bağlı)">
              <Input
                maxLength={300}
                value={form.address}
                onChange={(event) => setField('address', event.target.value)}
              />
            </Field>
            <Field label="Saat dilimi">
              <Input
                required
                value={form.timezone}
                onChange={(event) => setField('timezone', event.target.value)}
              />
            </Field>
            <Field label="İlk masa etiketi (isteğe bağlı)" hint="İlk QR kodu bu masa için basılır.">
              <Input
                maxLength={MAX_TABLE_LABEL_LENGTH}
                value={form.firstTableLabel}
                onChange={(event) => setField('firstTableLabel', event.target.value)}
                placeholder="Masa 1"
              />
            </Field>
            <Field label="Mekân sahibinin adı">
              <Input
                required
                minLength={2}
                maxLength={120}
                value={form.ownerName}
                onChange={(event) => setField('ownerName', event.target.value)}
              />
            </Field>
            <Field label="Mekân sahibinin e-postası" hint="İlk parolayı sistem üretir.">
              <Input
                required
                type="email"
                maxLength={180}
                value={form.ownerEmail}
                onChange={(event) => setField('ownerEmail', event.target.value)}
              />
            </Field>
          </div>

          {error ? <Notice>{error}</Notice> : null}
          {created ? (
            <InitialPassword password={created.initialPassword} subject={created.owner.email} />
          ) : null}

          <Button type="submit" disabled={saving}>
            {saving ? 'Oluşturuluyor…' : 'Mekânı oluştur'}
          </Button>
        </form>
      </Card>

      <Field label="Ara">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Mekân adı veya adres kısaltması"
        />
      </Field>

      {venues.error ? <Notice>{venues.error}</Notice> : null}

      {venues.loading && items.length === 0 ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          title="Mekân bulunamadı"
          hint="Aramayı temizle ya da yukarıdaki formla yeni bir mekân tanımla."
        />
      ) : (
        <>
          {total > items.length ? (
            <Notice tone="info">
              {total} mekândan ilk {items.length} tanesi listeleniyor. Aramayı daraltın.
            </Notice>
          ) : null}
          <ul className="space-y-3">
            {items.map((venue) => (
              <li key={venue.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{venue.name}</p>
                    <p className="text-xs text-muted">
                      /v/{venue.slug} · {venue.userCount} kullanıcı · {venue.timezone}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={venue.active ? 'positive' : 'neutral'}>
                      {venue.active ? 'Yayında' : 'Pasif'}
                    </Badge>
                    <ButtonLink href={`/system/venues/${venue.id}`} variant="secondary">
                      Yönet
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
