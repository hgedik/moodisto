import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Moodisto',
    template: '%s · Moodisto',
  },
  description:
    'Mekânın müziğini birlikte seçin: QR kodu okutun, şarkınızı isteyin, sıranızı canlı takip edin.',
  applicationName: 'Moodisto',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f0e17',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions stamp their own attributes onto <html> before React hydrates; that is a
    // mismatch React cannot patch up and has nothing to do with this app's markup.
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
