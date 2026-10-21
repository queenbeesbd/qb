'use client';

import type { ReactNode } from 'react';

/**
 * The root client boundary.
 *
 * It used to hold the locale store, because both surfaces were bilingual. With one interface
 * language there is no global client state at the root: the cart provider stays in the storefront
 * layout, where it belongs, and an admin page never subscribes to it. The component is kept as the
 * documented seam for a future root-level provider rather than being inlined into the layout.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
