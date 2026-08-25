'use client';

import type { ProviderPlayerProps } from './provider-player';

/**
 * A provider embed stand-in for the end-to-end suite.
 *
 * It plays nothing and reaches no external host: the track's lifecycle is driven by explicit
 * controls so that "the song finished, play the next one" can be asserted without an embed, a
 * network round trip or real audio. It is only ever mounted when NEXT_PUBLIC_PLAYER_STUB is set,
 * which is never the case in a production build.
 */
export function StubPlayer({ providerTrackId, paused, onEnded, onError }: ProviderPlayerProps) {
  return (
    <div
      data-testid="stub-player"
      data-track={providerTrackId}
      data-paused={paused ? 'true' : 'false'}
      className="space-y-3 rounded-xl border border-white/12 bg-ink-850 p-4"
    >
      <p className="text-sm text-muted">
        Test oynatıcısı · <span className="font-mono text-white">{providerTrackId}</span> ·{' '}
        {paused ? 'duraklatıldı' : 'çalıyor'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="stub-ended"
          onClick={() => onEnded()}
          className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white"
        >
          Parça bitti
        </button>
        <button
          type="button"
          data-testid="stub-error"
          onClick={() => onError('STUB_ERROR', 'Test oynatıcısı hata bildirdi.')}
          className="min-h-11 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white"
        >
          Oynatma hatası
        </button>
      </div>
    </div>
  );
}
