'use client';

import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import type { QueueUpdatedPayload, SongRequestDto } from '@moodisto/shared-types';
import { RequestStatus, ServerEvent, StatsPeriod } from '@moodisto/shared-types';
import { venueApi } from '@/lib/endpoints';
import { formatMoney, formatRelative, requestTypeLabel } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { useResource } from '@/lib/use-resource';
import { useVenueSession } from '@/lib/venue-session';
import { TrackSummary } from '@/components/track-summary';
import {
  Badge,
  ButtonLink,
  Card,
  ConnectionDot,
  EmptyState,
  Notice,
  PageHeader,
  Spinner,
} from '@/components/ui';

export default function VenueDashboardPage() {
  const { user } = useVenueSession();
  const venueId = user.venue.id;

  const pending = useResource((signal) => venueApi.requests(RequestStatus.PENDING, 20, signal), []);
  const queue = useResource((signal) => venueApi.queue(signal), []);
  const stats = useResource((signal) => venueApi.stats(StatsPeriod.TODAY, {}, signal), []);

  const reloadPending = pending.reload;
  const setQueue = queue.setData;

  const onRequest = useCallback(
    (payload: SongRequestDto) => {
      if (payload.venueId === venueId) {
        reloadPending();
      }
    },
    [reloadPending, venueId],
  );

  const { connected } = useRealtime(
    { scope: 'venue-admin', venueId },
    useMemo(
      () => ({
        [ServerEvent.RequestCreated]: onRequest,
        [ServerEvent.RequestUpdated]: onRequest,
        [ServerEvent.QueueUpdated]: (payload: QueueUpdatedPayload) => {
          if (payload.venueId === venueId) {
            setQueue(payload);
          }
        },
      }),
      [onRequest, setQueue, venueId],
    ),
  );

  const pendingCount = pending.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Panel"
        subtitle={<ConnectionDot connected={connected} />}
        actions={<ButtonLink href="/venue/player">Player&apos;ı aç</ButtonLink>}
      />

      {pending.error ? <Notice>{pending.error}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Onay bekleyen" value={String(pendingCount)} href="/venue/requests" />
        <Metric
          label="Sıradaki parça"
          value={String(queue.data?.upcoming.length ?? 0)}
          href="/venue/queue"
        />
        <Metric
          label="Bugünkü istek"
          value={String(stats.data?.totalRequests ?? 0)}
          href="/venue/stats"
        />
        <Metric
          label="Bugünkü gelir"
          value={stats.data ? formatMoney(stats.data.totalRevenueMinor, stats.data.currency) : '—'}
          href="/venue/stats"
        />
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Çalan</h2>
          <Link href="/venue/queue" className="text-xs text-brand-300 hover:text-brand-200">
            Sırayı yönet
          </Link>
        </div>
        {queue.loading ? (
          <Spinner />
        ) : queue.data?.current ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TrackSummary track={queue.data.current.track} className="min-w-56 flex-1" />
            <Badge tone="brand">{requestTypeLabel[queue.data.current.requestType]}</Badge>
          </div>
        ) : (
          <p className="text-sm text-muted">Şu anda bir parça çalmıyor.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Onay bekleyenler
          </h2>
          <Link href="/venue/requests" className="text-xs text-brand-300 hover:text-brand-200">
            Tümünü gör
          </Link>
        </div>
        {pending.loading ? (
          <Spinner />
        ) : pendingCount === 0 ? (
          <EmptyState title="Bekleyen istek yok" />
        ) : (
          <ul className="space-y-3">
            {(pending.data?.items ?? []).slice(0, 5).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                <TrackSummary track={item.track} size="sm" className="min-w-48 flex-1" />
                <span className="text-xs text-muted">
                  {item.tableLabel ?? '—'} · {formatRelative(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="surface block p-4 transition-colors hover:bg-white/6">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </Link>
  );
}
