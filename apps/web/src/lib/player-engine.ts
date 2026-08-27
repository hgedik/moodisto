'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerCommandPayload, PlayerStateDto, TrackDto } from '@moodisto/shared-types';
import { PlaybackState, PlayerCommand, ServerEvent } from '@moodisto/shared-types';
import { PLAYER_HEARTBEAT_INTERVAL_SECONDS } from '@moodisto/validation';
import { ApiError, errorMessage } from '@/lib/api-client';
import { playerApi } from '@/lib/endpoints';
import { playerSessionId } from '@/lib/player-session';
import { useRealtime } from '@/lib/realtime';

export interface PlayerEngine {
  readonly state: PlayerStateDto | null;
  readonly running: boolean;
  readonly starting: boolean;
  /** False until the tab id is read from storage; starting before that would have no lease holder. */
  readonly ready: boolean;
  readonly error: string | null;
  readonly conflict: boolean;
  readonly blocked: boolean;
  readonly connected: boolean;
  readonly paused: boolean;
  readonly track: TrackDto | null;
  readonly start: (takeover: boolean) => void;
  readonly togglePause: () => void;
  readonly skip: () => void;
  readonly retry: () => void;
  readonly onEnded: () => void;
  readonly onTrackError: (code: string, message: string) => void;
  readonly onBlocked: () => void;
}

/**
 * Drives one venue's playback: the lease, the heartbeat and the queue state behind it.
 *
 * It holds no markup on purpose. The embed must survive navigation between console pages, so the
 * caller mounts this once in the console layout instead of once per page.
 */
export const usePlayerEngine = (venueId: string): PlayerEngine => {
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

  const guard = useCallback(async (work: () => Promise<PlayerStateDto>): Promise<void> => {
    try {
      setState(await work());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  const start = useCallback((takeover: boolean): void => {
    if (sessionRef.current.length === 0) {
      return;
    }
    setStarting(true);
    setError(null);
    setConflict(false);
    setBlocked(false);
    // Started from a click, which is also the gesture the browser needs before it lets audio play.
    playerApi
      .start(sessionRef.current, takeover)
      .then((next) => {
        setState(next);
        setRunning(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.code === 'PLAYER_ALREADY_RUNNING') {
          setConflict(true);
        }
        setError(errorMessage(cause));
      })
      .finally(() => setStarting(false));
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

  const onBlocked = useCallback(() => setBlocked(true), []);

  const paused = state?.state === PlaybackState.PAUSED;

  const togglePause = useCallback(() => {
    void guard(() =>
      paused ? playerApi.resume(sessionRef.current) : playerApi.pause(sessionRef.current),
    );
  }, [guard, paused]);

  const skip = useCallback(() => {
    void guard(() => playerApi.skip(sessionRef.current));
  }, [guard]);

  const retry = useCallback(() => {
    void guard(() => playerApi.resume(sessionRef.current));
  }, [guard]);

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

  /** Leaving the console hands the venue back, so the next tab does not have to wait the lease out. */
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

  // Only a running player has anything to listen for, and an idle console page should not hold a
  // socket open for a venue it is not playing.
  const { connected } = useRealtime(
    running ? { scope: 'venue-player', venueId } : null,
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

  return {
    state,
    running,
    starting,
    ready: sessionId.length > 0,
    error,
    conflict,
    blocked,
    connected,
    paused,
    track: state?.current?.track ?? null,
    start,
    togglePause,
    skip,
    retry,
    onEnded,
    onTrackError,
    onBlocked,
  };
};
