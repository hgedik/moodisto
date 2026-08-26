'use client';

import { useState } from 'react';
import type { SystemUserDto } from '@moodisto/shared-types';
import { errorMessage } from '@/lib/api-client';
import { systemApi } from '@/lib/endpoints';
import { formatDateTime } from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import { InitialPassword } from '@/components/initial-password';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Spinner } from '@/components/ui';

export default function SystemUsersPage() {
  const operators = useResource((signal) => systemApi.operators(signal), []);
  const setOperators = operators.setData;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState<{ subject: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = operators.data ?? [];

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
      const created = await systemApi.createOperator({ name: name.trim(), email: email.trim() });
      setOperators([...items, created.user]);
      setPassword({ subject: created.user.email, value: created.initialPassword });
      setName('');
      setEmail('');
    });
  };

  const setActive = (operator: SystemUserDto, active: boolean): void => {
    void run(async () => {
      const saved = await systemApi.updateOperator(operator.id, { name: operator.name, active });
      setOperators(items.map((item) => (item.id === saved.id ? saved : item)));
    });
  };

  const resetPassword = (operator: SystemUserDto): void => {
    void run(async () => {
      setPassword(null);
      const result = await systemApi.resetOperatorPassword(operator.id);
      setPassword({ subject: operator.email, value: result.initialPassword });
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sistem operatörleri"
        subtitle="Sistem panelini kullanabilen hesaplar. Hesaplar silinmez; pasifleştirilen operatör giriş yapamaz."
      />

      {operators.error ? <Notice>{operators.error}</Notice> : null}

      {operators.loading && items.length === 0 ? (
        <Spinner />
      ) : (
        <Card className="space-y-4">
          <ul className="space-y-3">
            {items.map((operator) => (
              <li
                key={operator.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/4 p-3"
              >
                <div className="min-w-40">
                  <p className="font-semibold text-white">{operator.name}</p>
                  <p className="break-anywhere text-xs text-muted">{operator.email}</p>
                  <p className="text-xs text-muted">
                    Son giriş: {formatDateTime(operator.lastLoginAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={operator.active ? 'positive' : 'neutral'}>
                    {operator.active ? 'Aktif' : 'Pasif'}
                  </Badge>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => resetPassword(operator)}
                  >
                    Parolayı sıfırla
                  </Button>
                  <Button
                    variant={operator.active ? 'danger' : 'secondary'}
                    disabled={busy}
                    onClick={() => setActive(operator, !operator.active)}
                  >
                    {operator.active ? 'Pasifleştir' : 'Yeniden aktifleştir'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <form className="space-y-4 border-t border-white/8 pt-4" onSubmit={create}>
            <h2 className="text-sm font-semibold text-white">Operatör ekle</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ad">
                <Input
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="E-posta" hint="İlk parolayı sistem üretir.">
                <Input
                  required
                  type="email"
                  maxLength={180}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </div>

            {error ? <Notice>{error}</Notice> : null}
            {password ? (
              <InitialPassword password={password.value} subject={password.subject} />
            ) : null}

            <Button type="submit" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Operatör ekle'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
