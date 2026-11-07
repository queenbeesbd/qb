'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { trackVisit } from './track';

/**
 * Records one step per storefront navigation.
 *
 * It renders nothing. The checkout route reports `checkout_start` instead of `page_view` so the
 * funnel can tell "reached checkout" from "looked at a page", and every other route is a page view.
 *
 * The effect is keyed on the pathname, so a client-side navigation records once and a re-render does
 * not record again. A full page load records once, which is what a page view is.
 */
export function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === null) return;
    trackVisit(pathname === '/checkout' ? 'checkout_start' : 'page_view', pathname);
  }, [pathname]);

  return null;
}
