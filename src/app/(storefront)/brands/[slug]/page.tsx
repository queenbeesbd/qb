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
import { bestSellerRankingFor } from '@/server/orders/best-seller-ranking';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { brands } = await getStorefrontCatalog();
  const brand = brands.find((entry) => entry.slug === slug);
  return { title: brand ? (brand.name.en ?? brand.slug) : 'Brand' };
}

/**
 * One brand's products.
 *
 * The brand is named by the **route**, not by a query parameter, so a brand page has an address a shop
 * can link to and a customer can share. Everything else - department, price, availability, search,
 * sort and page - is the ordinary listing query, so the filters compose exactly as they do on
 * `/products`, and the same `CatalogView` renders it. An unknown slug is a real 404.
 *
 * Brand filtering inside the listing keys on the brand **name** (that is what the facet rows carry),
 * so the name resolved here is what the query receives. The product snapshot is the same one the facet
 * list was built from, so the heading, the count and the grid cannot disagree.
 */
export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const catalog = await getStorefrontCatalog();
  const brand = catalog.brands.find((entry) => entry.slug === slug);
  if (!brand) notFound();

  const brandName = brand.name.en ?? brand.name.bn ?? brand.slug;
  const parsed = parseCatalogQuery(await searchParams, catalog.categories);
  const query = { ...parsed, brands: [brandName] };
  const facets = buildCatalogFacets(catalog.products, catalog.categories, query.category);

  const matched = selectCatalog(catalog.products, query, await bestSellerRankingFor(query.sort));
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
      brand={{ name: brandName, productCount: brand.productCount }}
    />
  );
}
