import type { Metadata } from 'next';

import { NotFoundView } from '@/features/not-found/NotFoundView';
import { loadNotFoundShelf } from '@/server/catalog/not-found';

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The storefront's own 404, raised by `notFound()` inside `/products/<slug>`, `/categories/<slug>`,
 * `/brands/<slug>` and an order that the session cannot read.
 *
 * Same page as the root 404 and the same real shelf, with one difference: the storefront layout is
 * already above it, so the mark is not drawn a second time (`standalone` off) and there is a cart
 * provider in scope - but the shelf still links rather than adding, because a 404 should not be able
 * to change the cart.
 */
export default async function StorefrontNotFound() {
  const shelf = await loadNotFoundShelf();
  return (
    <NotFoundView
      products={shelf.products}
      categories={shelf.categories}
      inStockTotal={shelf.inStockTotal}
      unavailable={shelf.unavailable}
      standalone={false}
    />
  );
}
