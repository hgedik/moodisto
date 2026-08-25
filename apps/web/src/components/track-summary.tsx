import type { TrackDto, TrackSearchResultDto } from '@moodisto/shared-types';
import { formatDuration } from '@/lib/format';
import { cx } from './ui';

type TrackLike = TrackDto | TrackSearchResultDto;

/**
 * Cover, title, artist and length — the only track facts the browser ever receives. The provider
 * is identified by `provider` + `providerTrackId`; nothing here knows what a video id is.
 */
export function TrackSummary({
  track,
  size = 'md',
  className,
}: {
  track: TrackLike;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const thumbSize = size === 'sm' ? 'size-11' : 'size-14';
  return (
    <div className={cx('flex min-w-0 items-center gap-3', className)}>
      {track.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.thumbnailUrl}
          alt=""
          loading="lazy"
          className={cx(thumbSize, 'shrink-0 rounded-lg object-cover')}
        />
      ) : (
        <div className={cx(thumbSize, 'shrink-0 rounded-lg bg-white/10')} aria-hidden />
      )}
      <div className="min-w-0">
        <p className="truncate font-medium text-white">{track.title}</p>
        <p className="truncate text-sm text-muted">
          {track.artist ?? track.channelName ?? 'Bilinmeyen sanatçı'}
          {track.durationSeconds ? ` · ${formatDuration(track.durationSeconds)}` : ''}
        </p>
      </div>
    </div>
  );
}
