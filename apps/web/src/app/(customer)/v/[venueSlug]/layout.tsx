'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

const tabs = [
  { segment: '', label: 'Mekân' },
  { segment: '/search', label: 'Şarkı ara' },
  { segment: '/top', label: 'En çok istenen' },
];

export default function VenueCustomerLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ venueSlug: string }>();
  const pathname = usePathname();
  const base = `/v/${params.venueSlug}`;

  return (
    <div className="space-y-5">
      <nav className="flex gap-1 rounded-xl border border-white/8 bg-ink-900/60 p-1 text-sm">
        {tabs.map((tab) => {
          const href = `${base}${tab.segment}`;
          const active = tab.segment === '' ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              className={cx(
                'flex-1 rounded-lg px-3 py-2 text-center font-medium transition-colors',
                active ? 'bg-brand-500 text-white' : 'text-muted hover:text-white',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
