'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { TopRequestDto, VenueStatsUpdatedPayload } from '@moodisto/shared-types';
import { ServerEvent, TopRequestsPeriod } from '@moodisto/shared-types';
import { publicApi } from '@/lib/endpoints';
import { useRealtime } from '@/lib/realtime';
import { useResource } from '@/lib/use-resource';
import { TrackSummary } from '@/components/track-summary';
import { Card, ConnectionDot, EmptyState, Notice, PageHeader, Spinner, cx } from '@/components/ui';

const periods: readonly { readonly value: TopRequestsPeriod; readonly label: string }[] = [
  { value: TopRequestsPeriod.TONIGHT, label: 'Bu gece' },
  { value: TopRequestsPeriod.TODAY, label: 'Bugün' },
  { value: TopRequestsPeriod.WEEK, label: 'Bu hafta' },
];

export default function TopRequestsPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const [period, setPeriod] = useState<TopRequestsPeriod>(TopRequestsPeriod.TONIGHT);

  const top = useResource(
    (signal) => publicApi.topRequests(venueSlug, period, 10, signal),
    [venueSlug, period],
  );

  const setTop = top.setData;
  const { connected } = useRealtime(
    venueSlug ? { scope: 'venue-customers', venueSlug } : null,
    useMemo(
      () => ({
        [ServerEvent.VenueStatsUpdated]: (payload: VenueStatsUpdatedPayload) => {
          // The broadcast is always tonight's board; other ranges stay as loaded.
          if (period === TopRequestsPeriod.TONIGHT) {
            setTop(payload.topTracks);
          }
        },
      }),
      [period, setTop],
    ),
  );

  return (
    <div className="space-y-5">
      <PageHeader title="En çok istenen" subtitle={<ConnectionDot connected={connected} />} />

      <div className="flex gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1 text-sm">
        {periods.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setPeriod(item.value)}
            className={cx(
              'flex-1 rounded-lg px-3 py-2 font-medium transition-colors',
              period === item.value ? 'bg-brand-500 text-white' : 'text-muted hover:text-white',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {top.error ? <Notice>{top.error}</Notice> : null}

      <Card>
        {top.loading ? (
          <Spinner />
        ) : (top.data?.length ?? 0) === 0 ? (
          <EmptyState title="Henüz istek yok" hint="İlk isteği sen gönder." />
        ) : (
          <ol className="space-y-3">
            {(top.data ?? []).map((entry: TopRequestDto, index) => (
              <li
                key={`${entry.track.provider}:${entry.track.providerTrackId}`}
                className="flex items-center gap-3"
              >
                <span className="w-6 shrink-0 text-center text-lg font-bold text-brand-300">
                  {index + 1}
                </span>
                <TrackSummary track={entry.track} size="sm" className="flex-1" />
                <span className="shrink-0 text-sm text-muted">{entry.requestCount} istek</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
