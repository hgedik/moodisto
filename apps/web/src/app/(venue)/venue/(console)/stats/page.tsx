'use client';

import { useState } from 'react';
import { StatsPeriod } from '@moodisto/shared-types';
import { venueApi } from '@/lib/endpoints';
import { formatDateTime, formatDuration, formatMoney } from '@/lib/format';
import { useResource } from '@/lib/use-resource';
import { TrackSummary } from '@/components/track-summary';
import { Card, EmptyState, Field, Input, Notice, PageHeader, Spinner, cx } from '@/components/ui';

const periods: readonly { readonly value: StatsPeriod; readonly label: string }[] = [
  { value: StatsPeriod.TODAY, label: 'Bugün' },
  { value: StatsPeriod.LAST_7_DAYS, label: '7 gün' },
  { value: StatsPeriod.LAST_30_DAYS, label: '30 gün' },
  { value: StatsPeriod.CUSTOM, label: 'Özel' },
];

/** `datetime-local` gives a local wall clock; the API wants an instant. */
const toIso = (value: string): string | undefined =>
  value.length > 0 ? new Date(value).toISOString() : undefined;

export default function VenueStatsPage() {
  const [period, setPeriod] = useState<StatsPeriod>(StatsPeriod.TODAY);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const custom = period === StatsPeriod.CUSTOM;
  const ready = !custom || (from.length > 0 && to.length > 0);

  const stats = useResource(
    (signal) =>
      ready
        ? venueApi.stats(period, custom ? { from: toIso(from), to: toIso(to) } : {}, signal)
        : Promise.reject(new Error('Tarih aralığı seç.')),
    [period, ready ? from : '', ready ? to : '', ready],
  );

  const data = stats.data;
  const busiestCount = Math.max(1, ...(data?.requestsByHour ?? []).map((slot) => slot.count));

  return (
    <div className="space-y-5">
      <PageHeader title="İstatistik" />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1 text-sm sm:w-full">
          {periods.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              className={cx(
                'whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors sm:flex-1',
                period === item.value ? 'bg-brand-500 text-white' : 'text-muted hover:text-white',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {custom ? (
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlangıç">
            <Input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="Bitiş">
            <Input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
        </Card>
      ) : null}

      {stats.error && ready ? <Notice>{stats.error}</Notice> : null}

      {!ready ? (
        <EmptyState title="Tarih aralığı seç" />
      ) : stats.loading || !data ? (
        <Spinner />
      ) : (
        <>
          <p className="text-xs text-muted">
            {formatDateTime(data.period.from)} – {formatDateTime(data.period.to)}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Toplam istek" value={String(data.totalRequests)} />
            <Metric label="Onaylanan" value={String(data.acceptedRequests)} />
            <Metric label="Reddedilen" value={String(data.rejectedRequests)} />
            <Metric label="Ödenen" value={String(data.paidRequests)} />
            <Metric label="Gelir" value={formatMoney(data.totalRevenueMinor, data.currency)} />
            <Metric label="Sıradaki parça" value={String(data.queueLength)} />
            <Metric label="Ortalama bekleme" value={formatDuration(data.averageWaitSeconds)} />
            <Metric
              label="En yoğun saat"
              value={
                data.busiestHour === null ? '—' : `${String(data.busiestHour).padStart(2, '0')}:00`
              }
            />
          </div>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Saatlere göre istekler
            </h2>
            <div className="flex h-40 items-end gap-1">
              {data.requestsByHour.map((slot) => (
                <div key={slot.hour} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-brand-500/70"
                    style={{ height: `${(slot.count / busiestCount) * 100}%` }}
                    title={`${slot.hour}:00 · ${slot.count} istek`}
                  />
                  {slot.hour % 3 === 0 ? (
                    <span className="text-[10px] text-muted">{slot.hour}</span>
                  ) : (
                    <span className="text-[10px] text-transparent">·</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              En çok istenen parçalar
            </h2>
            {data.topTracks.length === 0 ? (
              <EmptyState title="Bu aralıkta istek yok" />
            ) : (
              <ol className="space-y-3">
                {data.topTracks.map((entry, index) => (
                  <li
                    key={`${entry.track.provider}:${entry.track.providerTrackId}`}
                    className="flex items-center gap-3"
                  >
                    <span className="w-6 shrink-0 text-center text-sm font-bold text-brand-300">
                      {index + 1}
                    </span>
                    <TrackSummary track={entry.track} size="sm" className="flex-1" />
                    <span className="shrink-0 text-sm text-muted">{entry.requestCount}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </Card>
  );
}
