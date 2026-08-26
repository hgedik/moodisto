'use client';

import type { ReactNode } from 'react';
import { SystemSessionProvider } from '@/lib/system-session';
import { Button, Notice, Spinner } from '@/components/ui';

export default function SystemConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <SystemSessionProvider
      fallback={({ loading, error }) => (
        <div className="mx-auto max-w-md px-4 py-16">
          {loading ? <Spinner label="Oturum doğrulanıyor…" /> : null}
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
    >
      {({ user, signOut }) => (
        <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pb-16 pt-5 sm:px-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black tracking-tight">
                <span className="text-brand-400">Mood</span>isto
                <span className="ml-2 text-sm font-medium text-muted">Sistem paneli</span>
              </p>
              <p className="text-sm text-muted">
                {user.name} · {user.email}
              </p>
            </div>
            <Button variant="ghost" onClick={() => void signOut()}>
              Çıkış yap
            </Button>
          </header>

          <main className="mt-6 flex-1">{children}</main>
        </div>
      )}
    </SystemSessionProvider>
  );
}
