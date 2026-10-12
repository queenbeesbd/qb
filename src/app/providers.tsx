'use client';

import type { ReactNode } from 'react';
import { LocaleProvider } from '@/i18n/LocaleProvider';

/**
 * The root client provider.
 *
 * Only the locale store is global: both the storefront and the admin surface are bilingual, and the
 * language toggle must work on either. The cart provider is deliberately *not* here - it is
 * storefront state, mounted by the storefront layout, so an admin page does not subscribe to
 * `localStorage` for a cart it will never show.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
