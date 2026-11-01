import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogView } from '@/features/catalog/CatalogView';
import {
  buildCatalogFacets,
  parseCatalogQuery,
  selectCatalog,
  slicePage,
} from '@/features/catalog/query';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { categories } = await getStorefrontCatalog();
  const category = categories.find((entry) => entry.slug === slug);
  if (!category) return { title: 'Category' };
  // English first, matching every other owner-data surface; the record's own language is the fallback.
  return { title: category.name.en ?? category.name.bn ?? slug };
}

/**
 * Category listing. The category comes from the route and all other filters
 * come from the query string, so the same CatalogView serves both this route
 * and /products without duplicated filtering logic. An unknown slug is a real
 * 404 rather than an empty listing, and the category is matched on its slug
 * because that is what the URL carries.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const catalog = await getStorefrontCatalog();
  const category = catalog.categories.find((entry) => entry.slug === slug);
  if (!category) notFound();

  const parsed = parseCatalogQuery(await searchParams, catalog.categories);
  const query = { ...parsed, category: category.slug };
  const facets = buildCatalogFacets(catalog.products, catalog.categories, query.category);

  const matched = selectCatalog(catalog.products, query);
  const page = slicePage(matched, query.page);

  return (
    <CatalogView
      results={page.items}
      facets={facets}
      categories={catalog.categories}
      query={query}
      totalCount={catalog.products.length}
      matchCount={matched.length}
      page={page.page}
      pageCount={page.pageCount}
    />
  );
}
