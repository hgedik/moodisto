'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NowPlayingDto, QueueEntryDto, SongRequestDto } from '@moodisto/shared-types';
import { RequestStatus, ServerEvent } from '@moodisto/shared-types';
import { publicApi } from '@/lib/endpoints';
import { formatMoney, requestStatusLabel, requestStatusTone, requestTypeLabel } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { readTableLabel } from '@/lib/table-label';
import { useResource } from '@/lib/use-resource';
import { NowPlayingCard } from '@/components/now-playing-card';
import { TrackSummary } from '@/components/track-summary';
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader, Spinner } from '@/components/ui';

/** Requests that no longer tell the guest anything are dropped from their own list. */
const LIVE_STATUSES = new Set<RequestStatus>([
  RequestStatus.PENDING_PAYMENT,
  RequestStatus.PENDING,
  RequestStatus.ACCEPTED,
  RequestStatus.QUEUED,
  RequestStatus.PLAYING,
]);

export default function VenueHomePage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const [tableLabel, setTableLabel] = useState<string | null>(null);

  useEffect(() => setTableLabel(readTableLabel(venueSlug)), [venueSlug]);

  const venue = useResource((signal) => publicApi.venue(venueSlug, signal), [venueSlug]);
  const nowPlaying = useResource((signal) => publicApi.nowPlaying(venueSlug, signal), [venueSlug]);
  const queue = useResource((signal) => publicApi.queue(venueSlug, signal), [venueSlug]);
  const mine = useResource((signal) => publicApi.myRequests(venueSlug, signal), [venueSlug]);

  const setNowPlaying = nowPlaying.setData;
  const setQueue = queue.setData;
  const setMine = mine.setData;
  const mineData = mine.data;

  const upsertMine = useCallback(
    (request: SongRequestDto) => {
      if (request.venueSlug !== venueSlug) {
        return;
      }
      const current = mineData ?? [];
      // A guest only sees their own requests, so an update for an unknown id is somebody else's.
      if (!current.some((item) => item.id === request.id)) {
        return;
      }
      setMine(current.map((item) => (item.id === request.id ? request : item)));
    },
    [mineData, setMine, venueSlug],
  );

  const { connected } = useRealtime(
    venueSlug ? { scope: 'venue-customers', venueSlug } : null,
    useMemo(
      () => ({
        [ServerEvent.PlayerNowPlaying]: (payload: NowPlayingDto) => setNowPlaying(payload),
        [ServerEvent.QueueUpdated]: (payload: { upcoming: readonly QueueEntryDto[] }) =>
          setQueue(payload.upcoming),
        [ServerEvent.RequestUpdated]: upsertMine,
      }),
      [setNowPlaying, setQueue, upsertMine],
    ),
  );

  if (venue.loading) {
    return <Spinner label="Mekân yükleniyor…" />;
  }
  if (venue.error || !venue.data) {
    return <Notice>{venue.error ?? 'Mekân bulunamadı.'}</Notice>;
  }

  const options = venue.data.requestOptions.filter((option) => option.enabled);
  const activeRequests = (mine.data ?? []).filter((item) => LIVE_STATUSES.has(item.status));
  const pastRequests = (mine.data ?? []).filter((item) => !LIVE_STATUSES.has(item.status));

  return (
    <div className="space-y-5">
      <PageHeader
        title={venue.data.name}
        subtitle={
          <span>
            {venue.data.address ?? 'Moodisto ile şarkı iste'}
            {tableLabel ? ` · ${tableLabel}` : ''}
          </span>
        }
        actions={<ButtonLink href={`/v/${venueSlug}/search`}>Şarkı iste</ButtonLink>}
      />

      <NowPlayingCard nowPlaying={nowPlaying.data} connected={connected} />

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Sırada</h2>
        {queue.loading ? (
          <Spinner />
        ) : (queue.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sıra boş" hint="İlk şarkıyı sen iste." />
        ) : (
          <ol className="space-y-3">
            {(queue.data ?? []).map((entry, index) => (
              <li key={entry.id} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted">
                  {index + 1}
                </span>
                <TrackSummary track={entry.track} size="sm" className="flex-1" />
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">İstek türleri</h2>
        {options.length === 0 ? (
          <p className="text-sm text-muted">Bu mekân şu anda istek almıyor.</p>
        ) : (
          <ul className="space-y-2">
            {options.map((option) => (
              <li
                key={option.type}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-white">
                  {requestTypeLabel[option.type]}
                </span>
                <span className="text-sm font-semibold text-brand-300">
                  {formatMoney(option.priceMinor, option.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">İsteklerim</h2>
        {mine.loading ? (
          <Spinner />
        ) : activeRequests.length + pastRequests.length === 0 ? (
          <EmptyState title="Henüz istek göndermedin" />
        ) : (
          <ul className="space-y-3">
            {[...activeRequests, ...pastRequests].map((item) => (
              <li key={item.id}>
                <Link
                  href={`/v/${venueSlug}/request/${item.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-white/5"
                >
                  <TrackSummary track={item.track} size="sm" className="flex-1" />
                  <Badge tone={requestStatusTone[item.status]}>
                    {requestStatusLabel[item.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
