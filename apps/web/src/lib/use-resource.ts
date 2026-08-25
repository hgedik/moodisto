'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api-client';

export interface Resource<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  /** Re-runs the loader; the previous request is aborted. */
  readonly reload: () => void;
  readonly setData: (value: T) => void;
}

/**
 * Loads one value from the API and keeps it fresh.
 *
 * `setData` exists so that realtime events can update what is on screen without a round trip;
 * everything else goes through `reload`.
 */
export const useResource = <T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);

    loaderRef
      .current(controller.signal)
      .then((value) => {
        if (active) {
          setData(value);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, error, loading, reload, setData };
};
