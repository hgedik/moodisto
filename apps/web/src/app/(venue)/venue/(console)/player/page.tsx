'use client';

import { useEffect } from 'react';
import { usePlayerDock } from '@/components/player/player-dock';
import { Card, PageHeader } from '@/components/ui';

/**
 * Playback itself belongs to the console layout now, so that moving between pages cannot stop the
 * music. This page is the door to it: it opens the dock and says where the controls went.
 */
export default function VenuePlayerPage() {
  const { expand, running } = usePlayerDock();

  useEffect(() => expand(), [expand]);

  return (
    <div className="space-y-5">
      <PageHeader title="Player" />
      <Card className="space-y-3">
        <p className="text-sm text-muted">
          Player artık sağ alt köşedeki kulakçıkta çalışıyor. Kulakçık konsolun her sayfasında açık
          kalır: İstekler, Sıra ya da İstatistik sayfasına geçtiğinde müzik kesilmez.
        </p>
        <p className="text-sm text-muted">
          {running
            ? 'Şu anda çalıyor. Kulakçığı açarak çalan parçayı, sıradakileri ve duraklat/sonraki düğmelerini görebilirsin.'
            : "Başlatmak için kulakçıktaki PLAYER'I BAŞLAT düğmesine bas. Bu sekmeyi mekânın ses çıkışına bağlı cihazda açık bırak."}
        </p>
        <p className="text-xs text-muted">
          Sayfayı yenilemek ya da konsoldan çıkmak player'ı durdurur; tarayıcı sesi başlatmak için
          yeniden bir dokunuş ister.
        </p>
      </Card>
    </div>
  );
}
