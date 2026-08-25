'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SongRequestDto } from '@moodisto/shared-types';
import { RequestStatus, ServerEvent } from '@moodisto/shared-types';
import { errorMessage } from '@/lib/api-client';
import { venueApi } from '@/lib/endpoints';
import {
  formatMoney,
  formatRelative,
  requestStatusLabel,
  requestStatusTone,
  requestTypeLabel,
} from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { useResource } from '@/lib/use-resource';
import { useVenueSession } from '@/lib/venue-session';
import { TrackSummary } from '@/components/track-summary';
import {
  Badge,
  Button,
  Card,
  ConnectionDot,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Spinner,
  cx,
} from '@/components/ui';

const tabs: readonly { readonly key: string; readonly label: string; readonly status?: string }[] =
  [
    { key: 'pending', label: 'Onay bekleyen', status: RequestStatus.PENDING },
    {
      key: 'active',
      label: 'Sırada',
      status: `${RequestStatus.ACCEPTED},${RequestStatus.QUEUED},${RequestStatus.PLAYING}`,
    },
    {
      key: 'done',
      label: 'Geçmiş',
      status: `${RequestStatus.COMPLETED},${RequestStatus.REJECTED},${RequestStatus.CANCELLED},${RequestStatus.EXPIRED},${RequestStatus.FAILED}`,
    },
    { key: 'all', label: 'Tümü' },
  ];

export default function VenueRequestsPage() {
  const { user } = useVenueSession();
  const [tab, setTab] = useState(tabs[0]!);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const requests = useResource((signal) => venueApi.requests(tab.status, 100, signal), [tab.key]);

  const setRequests = requests.setData;
  const data = requests.data;
  const reload = requests.reload;

  /**
   * A live request either replaces the row already on screen or, if the current filter would show
   * it, joins the top of the list. Anything else means the filter excludes it, so the list is left
   * alone rather than guessed at.
   */
  const applyLive = useCallback(
    (request: SongRequestDto) => {
      if (request.venueId !== user.venue.id) {
        return;
      }
      const current = data;
      if (!current) {
        return;
      }
      const known = current.items.some((item) => item.id === request.id);
      if (known) {
        const matches = !tab.status || tab.status.split(',').includes(request.status);
        const items = matches
          ? current.items.map((item) => (item.id === request.id ? request : item))
          : current.items.filter((item) => item.id !== request.id);
        setRequests({ items, total: matches ? current.total : Math.max(0, current.total - 1) });
        return;
      }
      if (!tab.status || tab.status.split(',').includes(request.status)) {
        setRequests({ items: [request, ...current.items], total: current.total + 1 });
      }
    },
    [data, setRequests, tab.status, user.venue.id],
  );

  const { connected } = useRealtime(
    { scope: 'venue-admin', venueId: user.venue.id },
    useMemo(
      () => ({
        [ServerEvent.RequestCreated]: applyLive,
        [ServerEvent.RequestUpdated]: applyLive,
      }),
      [applyLive],
    ),
  );

  const decide = async (
    requestId: string,
    action: 'accept' | 'reject',
    rejectionReason?: string,
  ): Promise<void> => {
    setBusyId(requestId);
    setActionError(null);
    try {
      const updated =
        action === 'accept'
          ? await venueApi.accept(requestId)
          : await venueApi.reject(requestId, rejectionReason?.trim() || null);
      applyLive(updated);
      setRejectingId(null);
      setReason('');
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="İstekler"
        subtitle={<ConnectionDot connected={connected} />}
        actions={
          <Button variant="secondary" onClick={reload}>
            Yenile
          </Button>
        }
      />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1 text-sm sm:w-full">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item)}
              className={cx(
                'whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors sm:flex-1',
                tab.key === item.key ? 'bg-brand-500 text-white' : 'text-muted hover:text-white',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {requests.error ? <Notice>{requests.error}</Notice> : null}
      {actionError ? <Notice>{actionError}</Notice> : null}

      {requests.loading ? (
        <Spinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Bu listede istek yok" />
      ) : (
        <ul className="space-y-3">
          {(data?.items ?? []).map((item) => (
            <li key={item.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <TrackSummary track={item.track} className="min-w-56 flex-1" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={requestStatusTone[item.status]}>
                      {requestStatusLabel[item.status]}
                    </Badge>
                    <Badge tone="brand">{requestTypeLabel[item.requestType]}</Badge>
                  </div>
                </div>

                <p className="text-xs text-muted">
                  {item.tableLabel ?? 'Masa belirtilmedi'} · {formatRelative(item.createdAt)} ·{' '}
                  {formatMoney(item.amountMinor, item.currency)}
                  {item.queuePosition !== null ? ` · sırada ${item.queuePosition}.` : ''}
                </p>

                {item.rejectionReason ? (
                  <p className="text-xs text-danger-400">Red nedeni: {item.rejectionReason}</p>
                ) : null}

                {item.status === RequestStatus.PENDING ? (
                  rejectingId === item.id ? (
                    <div className="space-y-2">
                      <Input
                        value={reason}
                        maxLength={280}
                        placeholder="Red nedeni (isteğe bağlı)"
                        onChange={(event) => setReason(event.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="danger"
                          disabled={busyId === item.id}
                          onClick={() => void decide(item.id, 'reject', reason)}
                        >
                          Reddet
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setRejectingId(null);
                            setReason('');
                          }}
                        >
                          Vazgeç
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={busyId === item.id}
                        onClick={() => void decide(item.id, 'accept')}
                      >
                        {busyId === item.id ? 'İşleniyor…' : 'Onayla'}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busyId === item.id}
                        onClick={() => {
                          setRejectingId(item.id);
                          setReason('');
                        }}
                      >
                        Reddet
                      </Button>
                    </div>
                  )
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
