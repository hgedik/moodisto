'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { SongRequestDto } from '@moodisto/shared-types';
import { RequestStatus, ServerEvent } from '@moodisto/shared-types';
import { errorMessage } from '@/lib/api-client';
import { publicApi } from '@/lib/endpoints';
import {
  formatDateTime,
  formatMoney,
  paymentStatusLabel,
  requestStatusLabel,
  requestStatusTone,
  requestTypeLabel,
} from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { useResource } from '@/lib/use-resource';
import { TrackSummary } from '@/components/track-summary';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConnectionDot,
  Notice,
  PageHeader,
  Spinner,
} from '@/components/ui';

/** Mirrors the server's state machine: these are the only statuses a guest may still withdraw. */
const CANCELLABLE = new Set<RequestStatus>([
  RequestStatus.PENDING_PAYMENT,
  RequestStatus.PENDING,
  RequestStatus.ACCEPTED,
  RequestStatus.QUEUED,
]);

const statusHint: Partial<Record<RequestStatus, string>> = {
  [RequestStatus.PENDING_PAYMENT]: 'Ödeme tamamlanınca isteğin mekâna iletilecek.',
  [RequestStatus.PENDING]: 'Mekân isteğini değerlendiriyor.',
  [RequestStatus.ACCEPTED]: 'İsteğin onaylandı, sıraya alınıyor.',
  [RequestStatus.QUEUED]: 'İsteğin sırada bekliyor.',
  [RequestStatus.PLAYING]: 'Şarkın şu anda çalıyor.',
  [RequestStatus.COMPLETED]: 'Şarkın çalındı.',
  [RequestStatus.REJECTED]: 'Mekân bu isteği kabul etmedi.',
  [RequestStatus.CANCELLED]: 'İsteği iptal ettin.',
  [RequestStatus.EXPIRED]: 'İstek zaman aşımına uğradı.',
  [RequestStatus.FAILED]: 'İstek tamamlanamadı. Ödeme alındıysa iade edilir.',
};

export default function RequestDetailPage() {
  const { venueSlug, requestId } = useParams<{ venueSlug: string; requestId: string }>();
  const request = useResource((signal) => publicApi.request(requestId, signal), [requestId]);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const setRequest = request.setData;
  const { connected } = useRealtime(
    requestId ? { scope: 'request', requestId } : null,
    useMemo(
      () => ({ [ServerEvent.RequestUpdated]: (payload: SongRequestDto) => setRequest(payload) }),
      [setRequest],
    ),
  );

  const cancel = async (): Promise<void> => {
    setCancelling(true);
    setCancelError(null);
    try {
      setRequest(await publicApi.cancelRequest(requestId));
    } catch (cause) {
      setCancelError(errorMessage(cause));
    } finally {
      setCancelling(false);
    }
  };

  if (request.loading) {
    return <Spinner label="İstek yükleniyor…" />;
  }
  if (request.error || !request.data) {
    return <Notice>{request.error ?? 'İstek bulunamadı.'}</Notice>;
  }

  const item = request.data;

  return (
    <div className="space-y-5">
      <PageHeader title="İsteğin" subtitle={<ConnectionDot connected={connected} />} />

      <Card className="space-y-4">
        <TrackSummary track={item.track} />

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={requestStatusTone[item.status]}>{requestStatusLabel[item.status]}</Badge>
          <Badge tone="brand">{requestTypeLabel[item.requestType]}</Badge>
          {item.queuePosition !== null ? <Badge>Sırada {item.queuePosition}. parça</Badge> : null}
        </div>

        <p className="text-sm text-muted">{statusHint[item.status]}</p>

        {item.rejectionReason ? (
          <Notice tone="danger">Mekânın notu: {item.rejectionReason}</Notice>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Tutar</dt>
            <dd className="font-semibold text-white">
              {formatMoney(item.amountMinor, item.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Ödeme</dt>
            <dd className="font-semibold text-white">
              {item.paymentStatus ? paymentStatusLabel[item.paymentStatus] : 'Gerekmiyor'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Masa</dt>
            <dd className="font-semibold text-white">{item.tableLabel ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Gönderildi</dt>
            <dd className="font-semibold text-white">{formatDateTime(item.createdAt)}</dd>
          </div>
        </dl>

        {cancelError ? <Notice>{cancelError}</Notice> : null}

        <div className="flex flex-wrap gap-2">
          {CANCELLABLE.has(item.status) ? (
            <Button variant="danger" onClick={() => void cancel()} disabled={cancelling}>
              {cancelling ? 'İptal ediliyor…' : 'İsteği iptal et'}
            </Button>
          ) : null}
          <ButtonLink href={`/v/${venueSlug}`} variant="secondary">
            Mekâna dön
          </ButtonLink>
          <ButtonLink href={`/v/${venueSlug}/search`} variant="ghost">
            Yeni istek
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
