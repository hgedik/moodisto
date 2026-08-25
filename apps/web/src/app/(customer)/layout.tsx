import Link from 'next/link';
import type { ReactNode } from 'react';

/** The shell every customer-facing page shares. Nothing here requires an account. */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-16 pt-5 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-black tracking-tight">
          <span className="text-brand-400">Mood</span>isto
        </Link>
        <Link href="/venue/login" className="text-xs font-medium text-muted hover:text-white">
          Mekân girişi
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-10 text-center text-xs text-muted">
        Moodisto · mekânın müziğini birlikte seçin
      </footer>
    </div>
  );
}
