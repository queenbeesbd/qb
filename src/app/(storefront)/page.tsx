import type { Metadata } from 'next';
import { HomeView } from '@/features/catalog/HomeSections';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

export const metadata: Metadata = {
  title: 'QueenBee’s — যত্নে বাছাই করা কসমেটিকস',
};

/**
 * Homepage. Every product, category and curated selection is read from the
 * authoritative catalog on the server, so no fabricated marketing claim can
 * appear here and an empty catalog is stated as the gap it is.
 */
export default async function HomePage() {
  const catalog = await getStorefrontCatalog();

  return (
    <HomeView
      products={catalog.products}
      categories={catalog.categories}
      featuredIds={catalog.featuredIds}
      collectionIds={catalog.collectionIds}
    />
  );
}
