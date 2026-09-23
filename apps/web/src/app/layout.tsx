import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';

import './globals.css';

// The brand guide specifies Open Sans for every heading and body use.
const openSans = Open_Sans({ subsets: ['latin'], variable: '--font-open-sans' });

export const metadata: Metadata = {
  title: 'Senior Care Local SEO & AI Visibility Audit | Sensi',
  description:
    'See how easily families can find your senior living community in local search and AI answers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={openSans.variable}>
      <body className="min-h-screen antialiased">
        <header className="border-b border-(--color-line) bg-(--color-surface)">
          <div className="mx-auto max-w-2xl px-6 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static brand
                asset never benefits from next/image's runtime resizing. */}
            <img src="/sensi-logo.svg" alt="Sensi" className="h-6 w-auto" />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
