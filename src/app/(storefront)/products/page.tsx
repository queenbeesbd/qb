import type { Metadata } from 'next';
import { CatalogView } from '@/features/catalog/CatalogView';
import { listBrands, parseCatalogQuery, selectCatalog } from '@/features/catalog/query';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { categories } = await getStorefrontCatalog();
  const query = parseCatalogQuery(await searchParams, categories);
  if (query.q) {
    return { title: `Search: ${query.q}` };
  }
  return { title: 'All products' };
}

/**
 * Full catalog listing. Filters, search and sorting are read from the URL so
 * every view is linkable, refreshable and shareable, and the server derives the
 * result set from one catalog snapshot so the listing can never disagree with
 * the catalog it came from.
 */
export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const catalog = await getStorefrontCatalog();
  const query = parseCatalogQuery(await searchParams, catalog.categories);

  return (
    <CatalogView
      results={selectCatalog(catalog.products, query)}
      brands={listBrands(catalog.products)}
      categories={catalog.categories}
      query={query}
      totalCount={catalog.products.length}
    />
  );
}
