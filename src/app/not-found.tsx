import type { Metadata } from 'next';

import { NotFoundView } from '@/features/not-found/NotFoundView';
import { loadNotFoundShelf } from '@/server/catalog/not-found';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The 404 for a URL that matches no route at all - `/anything-else`, which is what a mistyped or
 * vanished link actually lands on.
 *
 * It renders **outside** both route groups, so it has no storefront header and no cart provider. It
 * therefore draws its own mark (the `standalone` flag) instead of mounting chrome it cannot use, and
 * it does not offer Add to cart: a card that needs a cart it does not have is a broken control, so the
 * shelf links to the products instead and the real listing carries the buy action.
 *
 * The shelf is loaded here rather than inside the client view so the route stays a server component:
 * the page's entire value is real catalogue data, and it is read through the same cached snapshot
 * every storefront page uses. A failed read renders the page without a shelf, never an error.
 */
export default async function NotFound() {
  const shelf = await loadNotFoundShelf();
  return (
    <NotFoundView
      products={shelf.products}
      categories={shelf.categories}
      inStockTotal={shelf.inStockTotal}
      unavailable={shelf.unavailable}
      standalone
    />
  );
}
