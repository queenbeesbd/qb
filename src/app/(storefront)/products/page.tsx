import type { Metadata } from 'next';
import { CatalogView } from '@/features/catalog/CatalogView';
import { listBrands, parseCatalogQuery, selectCatalog, slicePage } from '@/features/catalog/query';
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

  /*
   * The listing pages. The catalog is still read whole on the server - it is one snapshot and the
   * filters need it - but only one page of it crosses into the client component, which is what keeps
   * the payload and the DOM from growing with the catalog.
   */
  const matched = selectCatalog(catalog.products, query);
  const page = slicePage(matched, query.page);

  return (
    <CatalogView
      results={page.items}
      brands={listBrands(catalog.products)}
      categories={catalog.categories}
      query={query}
      totalCount={catalog.products.length}
      matchCount={matched.length}
      page={page.page}
      pageCount={page.pageCount}
    />
  );
}
