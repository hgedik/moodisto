'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerCommandPayload, PlayerStateDto } from '@moodisto/shared-types';
import { PlaybackState, PlayerCommand, ServerEvent } from '@moodisto/shared-types';
import { PLAYER_HEARTBEAT_INTERVAL_SECONDS } from '@moodisto/validation';
import { ApiError, errorMessage } from '@/lib/api-client';
import { playerApi } from '@/lib/endpoints';
import { playbackStateLabel, requestTypeLabel } from '@/lib/format';
import { playerSessionId } from '@/lib/player-session';
import { useRealtime } from '@/lib/realtime';
import { useVenueSession } from '@/lib/venue-session';
import { TrackPlayer } from '@/components/player/track-player';
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

export default function VenuePlayerPage() {
  const { user } = useVenueSession();
  const venueId = user.venue.id;

  const [sessionId, setSessionId] = useState('');
  const [state, setState] = useState<PlayerStateDto | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => setSessionId(playerSessionId()), []);

  // The lease flag on a broadcast reflects whoever caused it, so ownership is only ever taken
  // from this tab's own start and heartbeat responses.
  const runningRef = useRef(false);
  runningRef.current = running;
  const sessionRef = useRef('');
  sessionRef.current = sessionId;

  const stop = useCallback((message: string | null) => {
    setRunning(false);
    setError(message);
  }, []);

  const start = async (takeover: boolean): Promise<void> => {
    setStarting(true);
    setError(null);
    setConflict(false);
    setBlocked(false);
    try {
      // Started from a click, which is also the gesture the browser needs before it lets audio play.
      const next = await playerApi.start(sessionId, takeover);
      setState(next);
      setRunning(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PLAYER_ALREADY_RUNNING') {
        setConflict(true);
      }
      setError(errorMessage(cause));
    } finally {
      setStarting(false);
    }
  };

  const guard = useCallback(async (work: () => Promise<PlayerStateDto>): Promise<void> => {
    try {
      setState(await work());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  const currentId = state?.current?.id ?? null;

  const onEnded = useCallback(() => {
    if (currentId && runningRef.current) {
      void guard(() => playerApi.complete(sessionRef.current, currentId));
    }
  }, [currentId, guard]);

  const onTrackError = useCallback(
    (code: string, message: string) => {
      if (currentId && runningRef.current) {
        void guard(() => playerApi.reportError(sessionRef.current, currentId, code, message));
      }
    },
    [currentId, guard],
  );

  /** The lease is what stops two tabs from driving one speaker system. */
  useEffect(() => {
    if (!running || sessionId.length === 0) {
      return;
    }
    const timer = setInterval(() => {
      playerApi
        .heartbeat(sessionId)
        .then((lease) => {
          if (!lease.heldByCaller) {
            stop('Player kontrolü başka bir sekmeye geçti.');
          }
        })
        .catch((cause: unknown) => stop(errorMessage(cause)));
    }, PLAYER_HEARTBEAT_INTERVAL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [running, sessionId, stop]);

  /** Leaving the page hands the venue back, so the next tab does not have to wait the lease out. */
  useEffect(() => {
    const release = (): void => {
      if (runningRef.current && sessionRef.current) {
        void playerApi.release(sessionRef.current).catch(() => undefined);
      }
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  const { connected } = useRealtime(
    { scope: 'venue-player', venueId },
    useMemo(
      () => ({
        [ServerEvent.PlayerUpdated]: (payload: PlayerStateDto) => {
          if (payload.venueId === venueId) {
            setState((previous) => ({ ...payload, leaseOwned: previous?.leaseOwned ?? false }));
          }
        },
        [ServerEvent.PlayerCommand]: (payload: PlayerCommandPayload) => {
          if (payload.venueId !== venueId) {
            return;
          }
          if (payload.command === PlayerCommand.LeaseRevoked) {
            stop('Player kontrolü başka bir sekmeye devredildi.');
            return;
          }
          if (payload.command === PlayerCommand.Reload && runningRef.current) {
            void guard(() => playerApi.state(sessionRef.current));
          }
        },
      }),
      [guard, stop, venueId],
    ),
  );

  const paused = state?.state === PlaybackState.PAUSED;
  const track = state?.current?.track ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Player"
        subtitle={<ConnectionDot connected={connected} />}
        actions={
          running ? (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  void guard(() =>
                    paused ? playerApi.resume(sessionId) : playerApi.pause(sessionId),
                  )
                }
              >
                {paused ? 'Devam et' : 'Duraklat'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void guard(() => playerApi.skip(sessionId))}
              >
                Sonraki
              </Button>
            </>
          ) : null
        }
      />

      {error ? <Notice>{error}</Notice> : null}
      {blocked ? (
        <Notice tone="info">
          Tarayıcı otomatik oynatmayı engelledi. Oynatıcıdaki oynat düğmesine bir kez dokun.
        </Notice>
      ) : null}

      {!running ? (
        <Card className="space-y-4 text-center">
          <p className="text-sm text-muted">
            Bu sekme mekânın hoparlörlerini yönetir. Ses çıkışının bağlı olduğu cihazda aç ve
            sekmeyi açık bırak.
          </p>
          <Button
            className="w-full py-4 text-base"
            disabled={starting || sessionId.length === 0}
            onClick={() => void start(false)}
          >
            {starting ? 'Başlatılıyor…' : "PLAYER'I BAŞLAT"}
          </Button>
          {conflict ? (
            <Button
              variant="danger"
              className="w-full"
              disabled={starting}
              onClick={() => void start(true)}
            >
              Diğer sekmeden devral
            </Button>
          ) : null}
        </Card>
      ) : !state ? (
        <Spinner label="Player durumu alınıyor…" />
      ) : track && state.current ? (
        <Card className="space-y-4">
          <TrackPlayer
            provider={track.provider}
            providerTrackId={track.providerTrackId}
            paused={paused}
            onEnded={onEnded}
            onError={onTrackError}
            onBlocked={() => setBlocked(true)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TrackSummary track={track} className="min-w-56 flex-1" />
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{requestTypeLabel[state.current.requestType]}</Badge>
              <Badge>{playbackStateLabel[state.state]}</Badge>
            </div>
          </div>
          {state.current.tableLabel ? (
            <p className="text-xs text-muted">İsteyen: {state.current.tableLabel}</p>
          ) : null}
        </Card>
      ) : (
        <Card>
          <EmptyState
            title="Sıra boş"
            hint="Onaylanan bir istek geldiğinde otomatik olarak çalmaya başlar."
          />
        </Card>
      )}

      {running && state ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Sırada</h2>
          {state.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Bekleyen parça yok.</p>
          ) : (
            <ol className="space-y-2">
              {state.upcoming.map((entry, index) => (
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
      ) : null}
    </div>
  );
}
