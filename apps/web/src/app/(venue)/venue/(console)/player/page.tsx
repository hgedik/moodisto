'use client';

import { PlaybackState } from '@moodisto/shared-types';
import { playbackStateLabel, requestTypeLabel } from '@/lib/format';
import { usePlayerEngine } from '@/lib/player-engine';
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
  const player = usePlayerEngine(user.venue.id);
  const { state, running, paused, track } = player;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Player"
        subtitle={<ConnectionDot connected={player.connected} />}
        actions={
          running ? (
            <>
              <Button variant="secondary" onClick={player.togglePause}>
                {paused ? 'Devam et' : 'Duraklat'}
              </Button>
              <Button variant="secondary" onClick={player.skip}>
                Sonraki
              </Button>
            </>
          ) : null
        }
      />

      {player.error ? <Notice>{player.error}</Notice> : null}
      {state && !state.providerPlaybackEnabled ? (
        <Notice tone="info">
          Sağlayıcı üzerinden oynatma sistem ayarlarından kapatılmış. Sıra olduğu gibi duruyor;
          açıldığında çalmaya kaldığı yerden devam eder.
        </Notice>
      ) : null}
      {player.blocked ? (
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
        </Card>
      ) : !state ? (
        <Spinner label="Player durumu alınıyor…" />
      ) : track && state.current ? (
        <Card className="space-y-4">
          {state.providerPlaybackEnabled ? (
            <TrackPlayer
              provider={track.provider}
              providerTrackId={track.providerTrackId}
              paused={paused}
              onEnded={player.onEnded}
              onError={player.onTrackError}
              onBlocked={player.onBlocked}
            />
          ) : (
            <EmptyState
              title="Oynatma kapalı"
              hint="Sistem panelinden sağlayıcı oynatması açılana kadar bu parça çalınmaz."
            />
          )}
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
      ) : state.state === PlaybackState.ERROR ? (
        <Card className="space-y-4">
          <EmptyState
            title="Oynatma durduruldu"
            hint="Üst üste birkaç parça çalınamadı. Sıra olduğu gibi duruyor: internet bağlantısını ve ses çıkışını kontrol ettikten sonra tekrar dene."
          />
          <Button className="w-full" onClick={player.retry}>
            Tekrar dene
          </Button>
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
