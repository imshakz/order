import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import { RESTAURANT_NAME } from '@/lib/config';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700', '800'] });
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: { default: RESTAURANT_NAME, template: `%s · ${RESTAURANT_NAME}` },
  description: 'Order, book and earn rewards.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2a22',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
