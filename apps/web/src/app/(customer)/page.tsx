'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { NearbyVenueDto } from '@moodisto/shared-types';
import { DEFAULT_NEARBY_RADIUS_METERS } from '@moodisto/validation';
import { errorMessage } from '@/lib/api-client';
import { publicApi } from '@/lib/endpoints';
import { formatDistance } from '@/lib/format';
import { Button, ButtonLink, Card, EmptyState, Input, Notice, Spinner } from '@/components/ui';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function HomePage() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);

  const [venues, setVenues] = useState<readonly NearbyVenueDto[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const openVenue = (): void => {
    const normalised = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalised)) {
      setSlugError('Mekân adresi küçük harf ve tire içermelidir, örneğin "moodisto-cafe".');
      return;
    }
    setSlugError(null);
    router.push(`/v/${normalised}`);
  };

  const findNearby = (): void => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Tarayıcınız konum paylaşımını desteklemiyor.');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        publicApi
          .nearby(position.coords.latitude, position.coords.longitude, DEFAULT_NEARBY_RADIUS_METERS)
          .then(setVenues)
          .catch((cause: unknown) => setLocationError(errorMessage(cause)))
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setLocationError('Konum alınamadı. Mekân adresini elle yazabilirsiniz.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">
          Mekânın müziğini
          <br />
          <span className="text-brand-400">birlikte seçin.</span>
        </h1>
        <p className="text-muted">
          Masanızdaki QR kodu okutun, istediğiniz şarkıyı arayın, isteğinizin sırasını canlı takip
          edin.
        </p>
      </section>

      <Card className="space-y-4">
        <h2 className="font-semibold">QR kodunuz yok mu?</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                openVenue();
              }
            }}
            placeholder="mekan-adresi"
            aria-label="Mekân adresi"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button onClick={openVenue} className="sm:w-40">
            Mekâna git
          </Button>
        </div>
        {slugError ? <Notice>{slugError}</Notice> : null}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Yakındaki mekânlar</h2>
          <Button variant="secondary" onClick={findNearby} disabled={locating}>
            {locating ? 'Aranıyor…' : 'Konumumu kullan'}
          </Button>
        </div>
        {locating ? <Spinner label="Yakındaki mekânlar aranıyor" /> : null}
        {locationError ? <Notice>{locationError}</Notice> : null}
        {venues && venues.length === 0 ? (
          <EmptyState
            title="Yakınında Moodisto kullanan bir mekân bulunamadı."
            hint="Mekâna QR kodunu sorabilirsiniz."
          />
        ) : null}
        {venues && venues.length > 0 ? (
          <ul className="space-y-2">
            {venues.map((venue) => (
              <li key={venue.id}>
                <ButtonLink
                  href={`/v/${venue.slug}`}
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <span className="truncate">{venue.name}</span>
                  <span className="text-xs text-muted">{formatDistance(venue.distanceMeters)}</span>
                </ButtonLink>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
