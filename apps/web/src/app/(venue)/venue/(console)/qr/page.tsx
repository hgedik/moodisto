'use client';

import { useEffect, useState } from 'react';
import type { QrCodeDto } from '@moodisto/shared-types';
import { MAX_TABLE_LABEL_LENGTH } from '@moodisto/validation';
import { toDataURL } from 'qrcode';
import { errorMessage } from '@/lib/api-client';
import { venueApi } from '@/lib/endpoints';
import { formatDateTime } from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import { canEditVenue } from '@/lib/format';
import { useVenueSession } from '@/lib/venue-session';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Spinner,
} from '@/components/ui';

export default function VenueQrPage() {
  const { user } = useVenueSession();
  const editable = canEditVenue(user.role);
  const codes = useResource((signal) => venueApi.qrCodes(signal), []);
  const [tableLabel, setTableLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setCodes = codes.setData;

  const create = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const label = tableLabel.trim();
      const created = await venueApi.createQrCode({ tableLabel: label.length > 0 ? label : null });
      setCodes([created, ...(codes.data ?? [])]);
      setTableLabel('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (qrCodeId: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await venueApi.deactivateQrCode(qrCodeId);
      setCodes(
        (codes.data ?? []).map((code) =>
          code.id === qrCodeId ? { ...code, active: false } : code,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="QR kodlar"
        subtitle="Her masa için ayrı kod bas; isteğe masa bilgisi otomatik eklenir."
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            Yazdır
          </Button>
        }
      />

      {editable ? (
        <Card>
          <form className="space-y-4 print:hidden" onSubmit={(event) => void create(event)}>
            <Field label="Masa adı (isteğe bağlı)">
              <Input
                maxLength={MAX_TABLE_LABEL_LENGTH}
                value={tableLabel}
                onChange={(event) => setTableLabel(event.target.value)}
                placeholder="Örneğin: Masa 4"
              />
            </Field>
            {error ? <Notice>{error}</Notice> : null}
            <Button type="submit" disabled={busy}>
              {busy ? 'Oluşturuluyor…' : 'QR kod oluştur'}
            </Button>
          </form>
        </Card>
      ) : null}

      {codes.error ? <Notice>{codes.error}</Notice> : null}

      {codes.loading ? (
        <Spinner />
      ) : (codes.data?.length ?? 0) === 0 ? (
        <EmptyState title="Henüz QR kod yok" hint="İlk kodu oluştur ve masaya yerleştir." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(codes.data ?? []).map((code) => (
            <li key={code.id}>
              <QrCodeCard code={code} busy={busy} editable={editable} onDeactivate={deactivate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QrCodeCard({
  code,
  busy,
  editable,
  onDeactivate,
}: {
  code: QrCodeDto;
  busy: boolean;
  editable: boolean;
  onDeactivate: (qrCodeId: string) => Promise<void>;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /** Rendered in the browser: the join url is already known here, so nothing extra is fetched. */
  useEffect(() => {
    let active = true;
    toDataURL(code.joinUrl, { width: 512, margin: 1, color: { dark: '#0f0e17', light: '#ffffff' } })
      .then((dataUrl) => {
        if (active) {
          setImage(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [code.joinUrl]);

  return (
    <Card className="space-y-3 text-center">
      <div className="mx-auto aspect-square w-full max-w-56 overflow-hidden rounded-xl bg-white p-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`${code.tableLabel ?? 'Mekân'} QR kodu`} className="size-full" />
        ) : failed ? (
          <p className="p-4 text-sm text-ink-900">QR kod oluşturulamadı.</p>
        ) : null}
      </div>
      <p className="font-semibold text-white">{code.tableLabel ?? 'Masa belirtilmedi'}</p>
      <p className="break-anywhere text-xs text-muted">{code.joinUrl}</p>
      <div className="flex items-center justify-center gap-2 print:hidden">
        <Badge tone={code.active ? 'positive' : 'neutral'}>{code.active ? 'Aktif' : 'Pasif'}</Badge>
        <span className="text-xs text-muted">{formatDateTime(code.createdAt)}</span>
      </div>
      {editable && code.active ? (
        <Button
          variant="danger"
          className="w-full print:hidden"
          disabled={busy}
          onClick={() => void onDeactivate(code.id)}
        >
          Pasifleştir
        </Button>
      ) : null}
    </Card>
  );
}
