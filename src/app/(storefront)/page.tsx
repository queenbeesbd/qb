import type { Metadata } from 'next';
import { HomeView } from '@/features/catalog/HomeSections';
import { selectHomepage } from '@/features/catalog/home-selection';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

export const metadata: Metadata = {
  title: 'QueenBee’s — Cosmetics storefront',
};

/**
 * Homepage. Every product, category and curated selection is read from the
 * authoritative catalog on the server, so no fabricated marketing claim can
 * appear here and an empty catalog is stated as the gap it is.
 *
 * The five selections are resolved here rather than in the view: the page has
 * always read the whole catalog, and passing it to the client meant the browser
 * downloaded all 1,477 products to draw twenty-eight cards.
 */
export default async function HomePage() {
  const catalog = await getStorefrontCatalog();
  const selection = selectHomepage({
    products: catalog.products,
    categories: catalog.categories,
    featuredIds: catalog.featuredIds,
    collectionIds: catalog.collectionIds,
  });

  return (
    <HomeView
      departments={selection.departments}
      heroProducts={selection.hero}
      featured={selection.featured}
      deals={selection.deals}
      recentlyAdded={selection.recentlyAdded}
      explore={selection.explore}
      isEmpty={selection.isEmpty}
    />
  );
}
