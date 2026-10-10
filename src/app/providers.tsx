'use client';

import type { ReactNode } from 'react';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { CartProvider } from '@/features/cart/CartProvider';

/**
 * Client providers. Cart and locale are the only global client state in the
 * demo; everything else renders on the server.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <CartProvider>{children}</CartProvider>
    </LocaleProvider>
  );
}
