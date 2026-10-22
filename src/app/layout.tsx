import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-latin',
});

const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-bengali',
});

export const metadata: Metadata = {
  title: {
    default: "QueenBee's — Cosmetics storefront",
    template: "%s · QueenBee's",
  },
  description:
    'QueenBee’s cosmetics shop. Browse the catalog and place a cash-on-delivery order.',
  icons: {
    icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

/**
 * The document shell.
 *
 * It carries only what both surfaces need: the fonts, the stylesheet, the language attribute and the
 * locale provider. Page chrome belongs to a surface, so the storefront's header, footer and cart
 * provider live in `(storefront)/layout.tsx` and the admin shell in `(admin)/admin/(app)/layout.tsx`.
 * Rendering storefront chrome here would put a cart on every admin page - and, as the build caught,
 * render the header above the provider it depends on.
 *
 * The document is marked `en`: the interface is English only (Phase 28), and a stored preference
 * cannot change that because no code reads one any more. The Bengali font stays because catalog
 * records and customer-entered text may contain Bengali - that is data, and it should render
 * correctly even though the interface around it is English.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${notoBengali.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
