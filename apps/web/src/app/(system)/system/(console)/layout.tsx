'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SystemSessionProvider } from '@/lib/system-session';
import { Button, Notice, Spinner, cx } from '@/components/ui';

const links = [
  { href: '/system/settings', label: 'Ayarlar' },
  { href: '/system/venues', label: 'Mekânlar' },
  { href: '/system/users', label: 'Kullanıcılar' },
];

export default function SystemConsoleLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-16 pt-5 sm:px-6">
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

          <nav className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1 text-sm sm:w-full">
              {links.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <li key={link.href} className="sm:flex-1">
                    <Link
                      href={link.href}
                      className={cx(
                        'block whitespace-nowrap rounded-lg px-3 py-2 text-center font-medium transition-colors',
                        active ? 'bg-brand-500 text-white' : 'text-muted hover:text-white',
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="mt-6 flex-1">{children}</main>
        </div>
      )}
    </SystemSessionProvider>
  );
}
