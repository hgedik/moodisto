'use client';

import { use, useEffect, useState } from 'react';
import type { VenueDetailDto, VenueUserDto } from '@moodisto/shared-types';
import { VenueUserRole } from '@moodisto/shared-types';
import { errorMessage } from '@/lib/api-client';
import { systemApi } from '@/lib/endpoints';
import { venueUserRoleLabel } from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import { InitialPassword } from '@/components/initial-password';
import {
  Button,
  ButtonLink,
  Card,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';

const ROLES: readonly VenueUserRole[] = [
  VenueUserRole.OWNER,
  VenueUserRole.MANAGER,
  VenueUserRole.DJ,
];

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function SystemVenueDetailPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = use(params);
  const detail = useResource((signal) => systemApi.venue(venueId, signal), [venueId]);
  const data = detail.data;
  const setDetail = detail.setData;

  return (
    <div className="space-y-5">
      <PageHeader
        title={data?.venue.name ?? 'Mekân'}
        subtitle={data ? `/v/${data.venue.slug}` : undefined}
        actions={
          <ButtonLink href="/system/venues" variant="secondary">
            Mekân listesi
          </ButtonLink>
        }
      />

      {detail.error ? <Notice>{detail.error}</Notice> : null}

      {detail.loading || !data ? (
        <Spinner />
      ) : (
        <>
          <VenueProfileForm
            venueId={venueId}
            venue={data.venue}
            onSaved={(venue) => setDetail({ ...data, venue })}
          />
          <VenueUsers
            venueId={venueId}
            users={data.users}
            onChanged={(users) => setDetail({ ...data, users })}
          />
        </>
      )}
    </div>
  );
}

function VenueProfileForm({
  venueId,
  venue,
  onSaved,
}: {
  venueId: string;
  venue: VenueDetailDto;
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
      const saved = await systemApi.updateVenue(venueId, {
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
      setStatus('Mekân bilgileri kaydedildi.');
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
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <Field label="Açıklama">
          <Textarea
            maxLength={500}
            value={form.description ?? ''}
            onChange={(event) => setForm({ ...form, description: event.target.value || null })}
          />
        </Field>

        <Field label="Adres">
          <Input
            maxLength={300}
            value={form.address ?? ''}
            onChange={(event) => setForm({ ...form, address: event.target.value || null })}
          />
        </Field>

        <Field label="Saat dilimi" hint="Örneğin: Europe/Istanbul">
          <Input
            required
            minLength={3}
            maxLength={64}
            value={form.timezone}
            onChange={(event) => setForm({ ...form, timezone: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Enlem" hint="Yakındaki mekânlar listesi için">
            <Input
              inputMode="decimal"
              value={form.latitude === null ? '' : String(form.latitude)}
              onChange={(event) => setForm({ ...form, latitude: numberOrNull(event.target.value) })}
            />
          </Field>
          <Field label="Boylam">
            <Input
              inputMode="decimal"
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
            value={form.logoUrl ?? ''}
            onChange={(event) => setForm({ ...form, logoUrl: event.target.value || null })}
          />
        </Field>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-brand-500"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          <span>Mekânı yayında tut</span>
        </label>

        {error ? <Notice>{error}</Notice> : null}
        {status ? <Notice tone="success">{status}</Notice> : null}

        <Button type="submit" disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </form>
    </Card>
  );
}

function VenueUsers({
  venueId,
  users,
  onChanged,
}: {
  venueId: string;
  users: readonly VenueUserDto[];
  onChanged: (value: readonly VenueUserDto[]) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<VenueUserRole>(VenueUserRole.DJ);
  const [password, setPassword] = useState<{ subject: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const create = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run(async () => {
      setPassword(null);
      const created = await systemApi.createVenueUser(venueId, {
        name: name.trim(),
        email: email.trim(),
        role,
      });
      onChanged([...users, created.user]);
      setPassword({ subject: created.user.email, value: created.initialPassword });
      setName('');
      setEmail('');
      setRole(VenueUserRole.DJ);
    });
  };

  const update = (user: VenueUserDto, change: Partial<VenueUserDto>): void => {
    void run(async () => {
      const saved = await systemApi.updateVenueUser(venueId, user.id, {
        name: change.name ?? user.name,
        role: change.role ?? user.role,
        active: change.active ?? user.active,
      });
      onChanged(users.map((item) => (item.id === saved.id ? saved : item)));
    });
  };

  const resetPassword = (user: VenueUserDto): void => {
    void run(async () => {
      setPassword(null);
      const result = await systemApi.resetVenueUserPassword(venueId, user.id);
      setPassword({ subject: user.email, value: result.initialPassword });
    });
  };

  return (
    <Card className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Kullanıcılar</h2>

      <ul className="space-y-3">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4 p-3"
          >
            <div className="min-w-40">
              <p className="font-semibold text-white">{user.name}</p>
              <p className="break-anywhere text-xs text-muted">{user.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={`${user.email} rolü`}
                className="w-36"
                disabled={busy}
                value={user.role}
                onChange={(event) => update(user, { role: event.target.value as VenueUserRole })}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {venueUserRoleLabel[option]}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-brand-500"
                  aria-label={`${user.email} aktif`}
                  disabled={busy}
                  checked={user.active}
                  onChange={(event) => update(user, { active: event.target.checked })}
                />
                <span>Aktif</span>
              </label>
              <Button variant="secondary" disabled={busy} onClick={() => resetPassword(user)}>
                Parolayı sıfırla
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <form className="space-y-4 border-t border-white/8 pt-4" onSubmit={create}>
        <h3 className="text-sm font-semibold text-white">Kullanıcı ekle</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ad">
            <Input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="E-posta">
            <Input
              required
              type="email"
              maxLength={180}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Rol">
            <Select value={role} onChange={(event) => setRole(event.target.value as VenueUserRole)}>
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {venueUserRoleLabel[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error ? <Notice>{error}</Notice> : null}
        {password ? <InitialPassword password={password.value} subject={password.subject} /> : null}

        <Button type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kullanıcı ekle'}
        </Button>
      </form>
    </Card>
  );
}
