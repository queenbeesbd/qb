import type { Metadata } from 'next';
import { CatalogView } from '@/features/catalog/CatalogView';
import { parseCatalogQuery } from '@/features/catalog/query';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const query = parseCatalogQuery(await searchParams);
  if (query.q) {
    return { title: `Search: ${query.q}` };
  }
  return { title: 'সব পণ্য' };
}

/**
 * Full catalog listing. Filters, search and sorting are read from the URL so
 * every view is linkable, refreshable and shareable, and the server and client
 * derive the same result set from one query parser.
 */
export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseCatalogQuery(await searchParams);
  return <CatalogView query={query} />;
}
