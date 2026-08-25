'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api-client';
import { publicApi } from '@/lib/endpoints';
import { rememberTableLabel } from '@/lib/table-label';
import { ButtonLink, Card, Notice, Spinner } from '@/components/ui';

/**
 * What a scanned QR code opens.
 *
 * The token is exchanged for a customer session server-side; the venue and the table it belongs
 * to come back from that exchange, so a guest cannot claim a table they did not scan.
 */
export default function JoinPage() {
  const params = useParams<{ qrToken: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    const qrToken = params.qrToken;
    if (!qrToken || attempted.current) {
      return;
    }
    attempted.current = true;

    publicApi
      .joinByQr(qrToken)
      .then((joined) => {
        rememberTableLabel(joined.venue.slug, joined.tableLabel);
        router.replace(`/v/${joined.venue.slug}`);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [params.qrToken, router]);

  if (error) {
    return (
      <Card className="space-y-4">
        <h1 className="text-xl font-bold">Bu QR kod çalışmıyor</h1>
        <Notice>{error}</Notice>
        <p className="text-sm text-muted">
          Kod devre dışı bırakılmış ya da yanlış okunmuş olabilir. Mekân görevlisinden yardım
          isteyebilirsiniz.
        </p>
        <ButtonLink href="/" variant="secondary">
          Ana sayfaya dön
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card>
      <Spinner label="Mekâna bağlanılıyor…" />
    </Card>
  );
}
