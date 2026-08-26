'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthenticatedSystemUserDto } from '@moodisto/shared-types';
import { ApiError, errorMessage } from './api-client';
import { systemAuthApi } from './endpoints';

interface SystemSession {
  readonly user: AuthenticatedSystemUserDto;
  readonly signOut: () => Promise<void>;
}

const SystemSessionContext = createContext<SystemSession | null>(null);

/**
 * Holds the signed-in operator for the system console.
 *
 * It is the venue provider's counterpart and deliberately separate from it: the two cookies are
 * different, so being signed in as a venue user must never open this console.
 */
export function SystemSessionProvider({
  children,
  fallback,
}: {
  children: (session: SystemSession) => ReactNode;
  fallback: (state: { loading: boolean; error: string | null }) => ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedSystemUserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    systemAuthApi
      .me(controller.signal)
      .then((value) => setUser(value))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (cause instanceof ApiError && cause.isUnauthorized) {
          router.replace('/system/login');
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
      await systemAuthApi.logout();
    } finally {
      router.replace('/system/login');
    }
  }, [router]);

  const session = useMemo(() => (user ? { user, signOut } : null), [user, signOut]);

  if (!session) {
    return <>{fallback({ loading, error })}</>;
  }
  return (
    <SystemSessionContext.Provider value={session}>
      {children(session)}
    </SystemSessionContext.Provider>
  );
}

export const useSystemSession = (): SystemSession => {
  const session = useContext(SystemSessionContext);
  if (!session) {
    throw new Error('useSystemSession, SystemSessionProvider içinde kullanılmalıdır.');
  }
  return session;
};
