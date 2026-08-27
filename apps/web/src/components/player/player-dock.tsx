'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PlaybackState } from '@moodisto/shared-types';
import { playbackStateLabel, requestTypeLabel } from '@/lib/format';
import { usePlayerEngine, type PlayerEngine } from '@/lib/player-engine';
import { TrackSummary } from '@/components/track-summary';
import { Badge, Button, ConnectionDot, EmptyState, Notice, Spinner, cx } from '@/components/ui';
import { TrackPlayer } from './track-player';

interface PlayerDockControls {
  /** Opens the flyout — used by the Player page, which only points at the dock now. */
  readonly expand: () => void;
  readonly running: boolean;
}

const PlayerDockContext = createContext<PlayerDockControls | null>(null);

export const usePlayerDock = (): PlayerDockControls => {
  const controls = useContext(PlayerDockContext);
  if (!controls) {
    throw new Error('usePlayerDock yalnızca PlayerDockProvider içinde kullanılabilir.');
  }
  return controls;
};

/**
 * Keeps one venue's player alive for the whole console.
 *
 * Mounted by the console layout, which App Router keeps mounted while the pages under it change:
 * the embed is therefore never torn down by navigation, and the music does not stop when the
 * operator goes to look at the queue.
 */
export function PlayerDockProvider({
  venueId,
  children,
}: {
  readonly venueId: string;
  readonly children: ReactNode;
}) {
  const player = usePlayerEngine(venueId);
  const [open, setOpen] = useState(false);

  const expand = useCallback(() => setOpen(true), []);
  const controls = useMemo<PlayerDockControls>(
    () => ({ expand, running: player.running }),
    [expand, player.running],
  );

  return (
    <PlayerDockContext.Provider value={controls}>
      {children}
      {/* The dock floats over the page, so the page is given room to scroll clear of it. */}
      <div aria-hidden className={cx('print:hidden', player.running ? 'h-56 sm:h-40' : 'h-4')} />
      <PlayerDock player={player} open={open} onToggle={() => setOpen((value) => !value)} />
    </PlayerDockContext.Provider>
  );
}

function PlayerDock({
  player,
  open,
  onToggle,
}: {
  readonly player: PlayerEngine;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const { state, running, paused, track } = player;

  /**
   * The embed keeps this one slot in both sizes. Collapsing only narrows the box around it, so the
   * iframe survives — and it stays on screen, because playback that nobody can see is not allowed.
   */
  const stage = !running ? null : !state ? (
    <Spinner label="Durum alınıyor…" />
  ) : !state.providerPlaybackEnabled ? (
    <EmptyState
      title="Oynatma kapalı"
      hint="Sistem panelinden sağlayıcı oynatması açılana kadar bu parça çalınmaz."
    />
  ) : track && state.current ? (
    <TrackPlayer
      provider={track.provider}
      providerTrackId={track.providerTrackId}
      paused={paused}
      onEnded={player.onEnded}
      onError={player.onTrackError}
      onBlocked={player.onBlocked}
    />
  ) : state.state === PlaybackState.ERROR ? (
    <EmptyState
      title="Oynatma durduruldu"
      hint="Üst üste birkaç parça çalınamadı. Sıra olduğu gibi duruyor."
    />
  ) : (
    <EmptyState
      title="Sırada parça yok"
      hint="Onaylanan bir istek geldiğinde otomatik olarak çalmaya başlar."
    />
  );

  return (
    <aside
      aria-label="Player"
      className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:bottom-4 sm:right-4 print:hidden"
    >
      <div
        className={cx(
          'surface flex max-h-[80dvh] flex-col gap-3 overflow-y-auto p-3 shadow-2xl shadow-black/50',
          open ? 'w-full sm:w-96' : 'w-full sm:w-80',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Player</span>
          {running ? <ConnectionDot connected={player.connected} /> : null}
          <Button
            variant="ghost"
            className="ml-auto min-h-9 px-2"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? 'Küçült' : 'Aç'}
          </Button>
        </div>

        {player.error ? <Notice>{player.error}</Notice> : null}
        {player.blocked ? (
          <Notice tone="info">
            Tarayıcı otomatik oynatmayı engelledi. Oynatıcıdaki oynat düğmesine bir kez dokun.
          </Notice>
        ) : null}
        {open && state && !state.providerPlaybackEnabled ? (
          <Notice tone="info">
            Sağlayıcı üzerinden oynatma sistem ayarlarından kapatılmış. Sıra olduğu gibi duruyor.
          </Notice>
        ) : null}

        <div className={cx('flex gap-3', open ? 'flex-col' : 'flex-row items-center')}>
          <div className={cx(open ? 'w-full' : 'w-40 shrink-0')}>{stage}</div>
          {track && state?.current ? (
            <div className="min-w-0 flex-1 space-y-2">
              <TrackSummary track={track} size="sm" />
              {open ? (
                <div className="flex flex-wrap gap-2">
                  <Badge tone="brand">{requestTypeLabel[state.current.requestType]}</Badge>
                  <Badge>{playbackStateLabel[state.state]}</Badge>
                  {state.current.tableLabel ? <Badge>{state.current.tableLabel}</Badge> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {running ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={player.togglePause}>
              {paused ? 'Devam et' : 'Duraklat'}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={player.skip}>
              Sonraki
            </Button>
          </div>
        ) : open ? (
          <div className="space-y-3 text-center">
            <p className="text-xs text-muted">
              Bu sekme mekânın hoparlörlerini yönetir. Ses çıkışının bağlı olduğu cihazda aç ve
              konsolu açık bırak; sekmeler arasında gezmek müziği kesmez.
            </p>
            <Button
              className="w-full py-3"
              disabled={player.starting || !player.ready}
              onClick={() => player.start(false)}
            >
              {player.starting ? 'Başlatılıyor…' : "PLAYER'I BAŞLAT"}
            </Button>
            {player.conflict ? (
              <Button
                variant="danger"
                className="w-full"
                disabled={player.starting}
                onClick={() => player.start(true)}
              >
                Diğer sekmeden devral
              </Button>
            ) : null}
          </div>
        ) : null}

        {open && running && state?.state === PlaybackState.ERROR ? (
          <Button className="w-full" onClick={player.retry}>
            Tekrar dene
          </Button>
        ) : null}

        {open && running && state ? (
          <div className="space-y-2 border-t border-white/8 pt-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Sırada</h2>
            {state.upcoming.length === 0 ? (
              <p className="text-sm text-muted">Bekleyen parça yok.</p>
            ) : (
              <ol className="space-y-2">
                {state.upcoming.map((entry, index) => (
                  <li key={entry.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted">
                      {index + 1}
                    </span>
                    <TrackSummary track={entry.track} size="sm" className="flex-1" />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
