'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthenticatedVenueUserDto } from '@moodisto/shared-types';
import { ApiError, errorMessage } from './api-client';
import { authApi } from './endpoints';

interface VenueSession {
  readonly user: AuthenticatedVenueUserDto;
  readonly signOut: () => Promise<void>;
}

const VenueSessionContext = createContext<VenueSession | null>(null);

/**
 * Holds the signed-in venue user for the console.
 *
 * The session itself lives in an HttpOnly cookie the browser cannot read, so who is signed in is
 * only ever learned by asking the API — this provider asks once and shares the answer.
 */
export function VenueSessionProvider({
  children,
  fallback,
}: {
  children: (session: VenueSession) => ReactNode;
  fallback: (state: { loading: boolean; error: string | null }) => ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedVenueUserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then((value) => setUser(value))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (cause instanceof ApiError && cause.isUnauthorized) {
          router.replace('/venue/login');
          return;
        }
        setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [router]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      router.replace('/venue/login');
    }
  }, [router]);

  const session = useMemo(() => (user ? { user, signOut } : null), [user, signOut]);

  if (!session) {
    return <>{fallback({ loading, error })}</>;
  }
  return (
    <VenueSessionContext.Provider value={session}>{children(session)}</VenueSessionContext.Provider>
  );
}

export const useVenueSession = (): VenueSession => {
  const session = useContext(VenueSessionContext);
  if (!session) {
    throw new Error('useVenueSession, VenueSessionProvider içinde kullanılmalıdır.');
  }
  return session;
};
