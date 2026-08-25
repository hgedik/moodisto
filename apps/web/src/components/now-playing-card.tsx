'use client';

import type { NowPlayingDto } from '@moodisto/shared-types';
import { PlaybackState } from '@moodisto/shared-types';
import { formatClock, playbackStateLabel, requestTypeLabel } from '@/lib/format';
import { TrackSummary } from './track-summary';
import { Badge, Card, ConnectionDot } from './ui';

/** What the room is hearing right now, as the server knows it. */
export function NowPlayingCard({
  nowPlaying,
  connected,
}: {
  nowPlaying: NowPlayingDto | null;
  connected: boolean;
}) {
  const playing = nowPlaying?.state === PlaybackState.PLAYING && nowPlaying.track !== null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Şimdi çalıyor</h2>
        <ConnectionDot connected={connected} />
      </div>

      {playing && nowPlaying?.track ? (
        <>
          <TrackSummary track={nowPlaying.track} />
          <div className="flex flex-wrap items-center gap-2">
            {nowPlaying.requestType ? (
              <Badge tone="brand">{requestTypeLabel[nowPlaying.requestType]}</Badge>
            ) : null}
            <span className="text-xs text-muted">
              {formatClock(nowPlaying.startedAt)} · sırada {nowPlaying.queueLength} parça
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">
          {nowPlaying ? playbackStateLabel[nowPlaying.state] : 'Bilinmiyor'} · şu anda bir parça
          çalmıyor.
        </p>
      )}
    </Card>
  );
}
