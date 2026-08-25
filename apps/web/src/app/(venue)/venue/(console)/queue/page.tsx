'use client';

import { useMemo, useRef, useState } from 'react';
import type { QueueEntryDto, QueueUpdatedPayload } from '@moodisto/shared-types';
import { ServerEvent } from '@moodisto/shared-types';
import { errorMessage } from '@/lib/api-client';
import { venueApi } from '@/lib/endpoints';
import { formatRelative, requestTypeLabel } from '@/lib/format';
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
  Notice,
  PageHeader,
  Spinner,
} from '@/components/ui';

/** Moves one entry, returning a new array; the caller decides whether to persist it. */
const move = (
  items: readonly QueueEntryDto[],
  from: number,
  to: number,
): readonly QueueEntryDto[] => {
  if (from === to || to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [entry] = next.splice(from, 1);
  if (!entry) {
    return items;
  }
  next.splice(to, 0, entry);
  return next;
};

export default function VenueQueuePage() {
  const { user } = useVenueSession();
  const queue = useResource((signal) => venueApi.queue(signal), []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const setQueue = queue.setData;
  const { connected } = useRealtime(
    { scope: 'venue-admin', venueId: user.venue.id },
    useMemo(
      () => ({
        [ServerEvent.QueueUpdated]: (payload: QueueUpdatedPayload) => {
          // Only the venue's own board is applied; the room never carries another venue's queue.
          if (payload.venueId === user.venue.id && !saving) {
            setQueue(payload);
          }
        },
      }),
      [saving, setQueue, user.venue.id],
    ),
  );

  const upcoming = queue.data?.upcoming ?? [];

  const persist = async (next: readonly QueueEntryDto[]): Promise<void> => {
    const previous = queue.data;
    if (!previous) {
      return;
    }
    setQueue({ ...previous, upcoming: next });
    setSaving(true);
    setError(null);
    try {
      setQueue(await venueApi.reorderQueue(next.map((entry) => entry.id)));
    } catch (cause) {
      setError(errorMessage(cause));
      setQueue(previous);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (queueItemId: string): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      setQueue(await venueApi.removeFromQueue(queueItemId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sıra"
        subtitle={<ConnectionDot connected={connected} />}
        actions={
          <Button variant="secondary" onClick={queue.reload} disabled={saving}>
            Yenile
          </Button>
        }
      />

      {queue.error ? <Notice>{queue.error}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Çalan</h2>
        {queue.data?.current ? (
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Bekleyenler</h2>
          <span className="text-xs text-muted">{upcoming.length} parça</span>
        </div>
        <p className="text-xs text-muted">
          Sırayı sürükleyerek ya da ok tuşlarıyla değiştirebilirsin.
        </p>

        {queue.loading ? (
          <Spinner />
        ) : upcoming.length === 0 ? (
          <EmptyState title="Sıra boş" />
        ) : (
          <ol className="space-y-2">
            {upcoming.map((entry, index) => (
              <li
                key={entry.id}
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragIndex.current;
                  dragIndex.current = null;
                  if (from !== null && from !== index) {
                    void persist(move(upcoming, from, index));
                  }
                }}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/4 p-2"
              >
                <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted">
                  {index + 1}
                </span>
                <TrackSummary track={entry.track} size="sm" className="min-w-48 flex-1" />
                <span className="text-xs text-muted">
                  {entry.tableLabel ?? '—'} · {formatRelative(entry.createdAt)}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="secondary"
                    aria-label="Yukarı taşı"
                    disabled={saving || index === 0}
                    onClick={() => void persist(move(upcoming, index, index - 1))}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label="Aşağı taşı"
                    disabled={saving || index === upcoming.length - 1}
                    onClick={() => void persist(move(upcoming, index, index + 1))}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="danger"
                    aria-label="Sıradan çıkar"
                    disabled={saving}
                    onClick={() => void remove(entry.id)}
                  >
                    Çıkar
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
