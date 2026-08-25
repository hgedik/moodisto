'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { errorMessage } from '@/lib/api-client';
import { publicApi } from '@/lib/endpoints';
import { formatMoney } from '@/lib/format';
import { Button, Card, Notice, PageHeader, Spinner } from '@/components/ui';

/**
 * Only a path on this origin is ever followed. The return url arrives in the query string, which
 * anyone can rewrite; an absolute one would turn this page into an open redirect.
 */
const safeReturnPath = (value: string | null): string => {
  if (!value) {
    return '/';
  }
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin ? `${target.pathname}${target.search}` : '/';
  } catch {
    return '/';
  }
};

function MockCheckout() {
  const params = useSearchParams();
  const paymentId = params.get('paymentId') ?? '';
  const amountMinor = Number.parseInt(params.get('amountMinor') ?? '0', 10);
  const currency = params.get('currency') ?? 'TRY';
  const returnUrl = params.get('returnUrl');

  const [pending, setPending] = useState<'PAID' | 'FAILED' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settle = async (status: 'PAID' | 'FAILED'): Promise<void> => {
    setPending(status);
    setError(null);
    try {
      await publicApi.settleMockPayment(paymentId, status);
      // The redirect happens only after the server has recorded the outcome, so the request page
      // never renders a status the database has not reached yet.
      window.location.assign(safeReturnPath(returnUrl));
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(null);
    }
  };

  if (paymentId.length === 0) {
    return <Notice>Ödeme bilgisi eksik.</Notice>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Test ödemesi"
        subtitle="Bu sayfa yalnızca geliştirme ortamındaki sahte ödeme sağlayıcısı içindir."
      />
      <Card className="space-y-4">
        <div>
          <p className="text-sm text-muted">Tutar</p>
          <p className="text-3xl font-bold text-white">
            {formatMoney(Number.isFinite(amountMinor) ? amountMinor : 0, currency)}
          </p>
        </div>
        <p className="break-anywhere text-xs text-muted">Ödeme kimliği: {paymentId}</p>

        {error ? <Notice>{error}</Notice> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            disabled={pending !== null}
            onClick={() => void settle('PAID')}
          >
            {pending === 'PAID' ? 'Onaylanıyor…' : 'Ödemeyi onayla'}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={pending !== null}
            onClick={() => void settle('FAILED')}
          >
            {pending === 'FAILED' ? 'İşleniyor…' : 'Ödemeyi reddet'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={<Spinner label="Ödeme sayfası yükleniyor…" />}>
      <MockCheckout />
    </Suspense>
  );
}
