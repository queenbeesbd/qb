import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogView } from '@/features/catalog/CatalogView';
import { parseCatalogQuery } from '@/features/catalog/query';
import { categories, getCategoryBySlug } from '@/data/categories';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: 'ক্যাটাগরি' };
  return { title: category.name.bn ?? category.name.en ?? slug };
}

/**
 * Category listing. The category comes from the route and all other filters
 * come from the query string, so the same CatalogView serves both this route
 * and /products without duplicated filtering logic.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const parsed = parseCatalogQuery(await searchParams);
  return <CatalogView query={{ ...parsed, category: category.id }} />;
}
