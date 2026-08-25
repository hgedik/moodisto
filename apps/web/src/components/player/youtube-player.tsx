'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderPlayerProps } from './provider-player';

/**
 * The YouTube embed, kept visible and unmodified.
 *
 * Playback happens in YouTube's own iframe with its own controls and advertising; nothing here
 * extracts, proxies or hides the stream. Only this file knows what a video id is.
 */

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';

interface YouTubePlayerInstance {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
  getPlayerState(): number;
}

interface YouTubeEvent<T> {
  readonly target: YouTubePlayerInstance;
  readonly data: T;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YouTubeEvent<undefined>) => void;
        onStateChange?: (event: YouTubeEvent<number>) => void;
        onError?: (event: YouTubeEvent<number>) => void;
      };
    },
  ) => YouTubePlayerInstance;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; UNSTARTED: number };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

/** Loads the IFrame API once per document, however many players ask for it. */
const loadIframeApi = (): Promise<YouTubeNamespace> => {
  if (apiPromise) {
    return apiPromise;
  }
  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube oynatıcısı yüklenemedi.'));
      }
    };
    const script = document.createElement('script');
    script.src = IFRAME_API_SRC;
    script.async = true;
    script.onerror = () => reject(new Error('YouTube oynatıcısı yüklenemedi.'));
    document.head.appendChild(script);
  });
  return apiPromise;
};

/**
 * Playback states the API reports as documented numbers.
 *
 * Only the two that mean "loaded but not playing" are needed here, and they are read from a
 * player instance rather than the namespace, so they are spelled out instead of looked up.
 */
const YT_UNSTARTED = -1;
const YT_CUED = 5;

/** How long the embed is given to actually start before autoplay counts as refused. */
const AUTOPLAY_GRACE_MS = 1_500;

const ERROR_MESSAGES: Record<number, string> = {
  2: 'Parça kimliği geçersiz.',
  5: 'Parça bu oynatıcıda çalınamıyor.',
  100: 'Parça kaldırılmış veya gizli.',
  101: 'Telif sahibi bu parçanın gömülü oynatılmasına izin vermiyor.',
  150: 'Telif sahibi bu parçanın gömülü oynatılmasına izin vermiyor.',
};

export function YouTubePlayer({
  providerTrackId,
  paused,
  onEnded,
  onError,
  onBlocked,
}: ProviderPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const loadedRef = useRef<string | null>(null);
  // The embed is built once and then told which track to play, so the iframe outlives a track
  // change. Until YouTube reports it ready, `loadVideoById` and `playVideo` are simply ignored,
  // which is why readiness is state and not a ref: the sync effect has to run again once it flips.
  const [ready, setReady] = useState(false);

  // Callbacks are read through refs so a parent re-render never rebuilds the iframe mid-track.
  const handlers = useRef({ onEnded, onError, onBlocked });
  handlers.current = { onEnded, onError, onBlocked };
  // The track the embed should be showing, readable from inside the one-shot mount effect.
  const trackRef = useRef(providerTrackId);
  trackRef.current = providerTrackId;

  useEffect(() => {
    let cancelled = false;
    const mount = containerRef.current;
    if (!mount) {
      return;
    }

    loadIframeApi()
      .then((yt) => {
        if (cancelled) {
          return;
        }
        const host = document.createElement('div');
        mount.appendChild(host);
        // The first track is handed over at construction time. Without it the API builds an
        // embed with no video in it, and every later `loadVideoById` lands on a player that has
        // nothing to replace.
        const initialTrackId = trackRef.current;
        playerRef.current = new yt.Player(host, {
          videoId: initialTrackId,
          playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              if (cancelled) {
                return;
              }
              loadedRef.current = initialTrackId;
              setReady(true);
            },
            onStateChange: (event) => {
              if (event.data === yt.PlayerState.ENDED) {
                handlers.current.onEnded();
              }
            },
            onError: (event) => {
              handlers.current.onError(
                `YT_${event.data}`,
                ERROR_MESSAGES[event.data] ?? 'Parça çalınamadı.',
              );
            },
          },
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          handlers.current.onError(
            'YT_API_UNAVAILABLE',
            cause instanceof Error ? cause.message : 'YouTube oynatıcısı yüklenemedi.',
          );
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedRef.current = null;
      setReady(false);
      mount.replaceChildren();
    };
  }, []);

  /**
   * Asks the embed to start, and reports back if it refuses.
   *
   * A browser that blocks autoplay does not throw: `playVideo` returns and the player simply stays
   * unstarted. The state is therefore read again a moment later, so the venue is told to tap the
   * embed once instead of watching a queue that never moves.
   */
  const play = useCallback((player: YouTubePlayerInstance): (() => void) => {
    player.playVideo();
    const timer = setTimeout(() => {
      if (playerRef.current !== player) {
        return;
      }
      const state = player.getPlayerState();
      if (state === YT_UNSTARTED || state === YT_CUED) {
        handlers.current.onBlocked();
      }
    }, AUTOPLAY_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ready) {
      return;
    }
    if (loadedRef.current !== providerTrackId) {
      loadedRef.current = providerTrackId;
      player.loadVideoById(providerTrackId);
    }
    if (paused) {
      player.pauseVideo();
      return;
    }
    return play(player);
  }, [providerTrackId, paused, ready, play]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      <div ref={containerRef} className="size-full [&>*]:size-full" />
    </div>
  );
}
