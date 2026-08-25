'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  RequestTypeOptionDto,
  TrackSearchResultDto,
  VenueDetailDto,
} from '@moodisto/shared-types';
import {
  MAX_SEARCH_RESULTS,
  MAX_TABLE_LABEL_LENGTH,
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
} from '@moodisto/validation';
import { errorMessage } from '@/lib/api-client';
import { publicApi } from '@/lib/endpoints';
import { formatMoney, requestTypeHint, requestTypeLabel } from '@/lib/format';
import { readTableLabel, rememberTableLabel } from '@/lib/table-label';
import { useResource } from '@/lib/use-resource';
import { TrackSummary } from '@/components/track-summary';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Spinner,
} from '@/components/ui';

export default function SearchPage() {
  const { venueSlug } = useParams<{ venueSlug: string }>();
  const venue = useResource((signal) => publicApi.venue(venueSlug, signal), [venueSlug]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly TrackSearchResultDto[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrackSearchResultDto | null>(null);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_SEARCH_QUERY_LENGTH;
  const venueId = venue.data?.id;

  /**
   * Search costs external quota, so nothing leaves the browser until the guest stops typing for
   * {@link SEARCH_DEBOUNCE_MS} and has entered at least {@link MIN_SEARCH_QUERY_LENGTH} characters.
   */
  useEffect(() => {
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      publicApi
        .search(trimmed, MAX_SEARCH_RESULTS, venueId, controller.signal)
        .then((response) => {
          setResults(response.results);
          setSearchError(null);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setSearchError(errorMessage(cause));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, venueId]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Şarkı ara"
        subtitle={venue.data ? `${venue.data.name} için istek gönder` : undefined}
      />

      <Field label="Şarkı veya sanatçı" hint={`En az ${MIN_SEARCH_QUERY_LENGTH} karakter yaz.`}>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Örneğin: Sezen Aksu"
          autoComplete="off"
          enterKeyHint="search"
          type="search"
          aria-label="Şarkı veya sanatçı ara"
        />
      </Field>

      {tooShort ? <p className="text-sm text-muted">Aramak için biraz daha yaz…</p> : null}
      {searchError ? <Notice>{searchError}</Notice> : null}
      {searching && !searchError ? <Spinner label="Aranıyor…" /> : null}

      {!searching && results !== null ? (
        results.length === 0 ? (
          <EmptyState title="Sonuç bulunamadı" hint="Başka bir yazımla dene." />
        ) : (
          <ul className="space-y-2">
            {results.map((track) => (
              <li key={`${track.provider}:${track.providerTrackId}`}>
                <button
                  type="button"
                  onClick={() => setSelected(track)}
                  className="w-full rounded-xl p-2 text-left transition-colors hover:bg-white/6 active:bg-white/10"
                >
                  <TrackSummary track={track} />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {selected && venue.data ? (
        <RequestSheet
          venue={venue.data}
          venueSlug={venueSlug}
          track={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

/** Choosing the request type is the last step before money and the venue's queue get involved. */
function RequestSheet({
  venue,
  venueSlug,
  track,
  onClose,
}: {
  venue: VenueDetailDto;
  venueSlug: string;
  track: TrackSearchResultDto;
  onClose: () => void;
}) {
  const router = useRouter();
  const options = venue.requestOptions.filter((option) => option.enabled);
  const [tableLabel, setTableLabel] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTableLabel(readTableLabel(venueSlug) ?? ''), [venueSlug]);

  const send = async (option: RequestTypeOptionDto): Promise<void> => {
    setPending(option.type);
    setError(null);
    const label = tableLabel.trim();
    try {
      const response = await publicApi.createRequest(venueSlug, {
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        requestType: option.type,
        tableLabel: label.length > 0 ? label : null,
      });
      rememberTableLabel(venueSlug, response.request.tableLabel);
      // A paid request must survive the trip through the payment provider, so the browser leaves
      // for checkout and comes back to the request page the server put in the return url.
      if (response.payment?.checkoutUrl) {
        window.location.assign(response.payment.checkoutUrl);
        return;
      }
      router.push(`/v/${venueSlug}/request/${response.request.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="İstek türünü seç"
    >
      <Card className="w-full max-w-lg space-y-4 rounded-b-none sm:rounded-2xl">
        <TrackSummary track={track} />

        <Field label="Masa (isteğe bağlı)">
          <Input
            value={tableLabel}
            maxLength={MAX_TABLE_LABEL_LENGTH}
            onChange={(event) => setTableLabel(event.target.value)}
            placeholder="Örneğin: Masa 4"
          />
        </Field>

        {error ? <Notice>{error}</Notice> : null}

        {options.length === 0 ? (
          <Notice tone="info">Bu mekân şu anda istek almıyor.</Notice>
        ) : (
          <ul className="space-y-2">
            {options.map((option) => (
              <li key={option.type}>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void send(option)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  <span>
                    <span className="block font-semibold text-white">
                      {requestTypeLabel[option.type]}
                    </span>
                    <span className="block text-xs text-muted">{requestTypeHint[option.type]}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-brand-300">
                    {pending === option.type
                      ? 'Gönderiliyor…'
                      : formatMoney(option.priceMinor, option.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button variant="ghost" className="w-full" onClick={onClose} disabled={pending !== null}>
          Vazgeç
        </Button>
      </Card>
    </div>
  );
}
