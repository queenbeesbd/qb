import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailView } from '@/features/catalog/ProductDetailView';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const product = products.find((entry) => entry.slug === slug);
  if (!product) return { title: 'Product' };
  return {
    title: product.name.bn ?? product.name.en ?? slug,
    description: product.description.bn ?? product.description.en ?? undefined,
  };
}

/**
 * Product detail route. Unknown slugs return a real 404 rather than a blank
 * product page, and the product, its category and its related products are all
 * resolved on the server from one catalog snapshot.
 *
 * There is deliberately no `generateStaticParams`: the storefront renders the
 * live catalog, so product routes must not be pinned to build-time slugs.
 */
export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const catalog = await getStorefrontCatalog();
  const product = catalog.products.find((entry) => entry.slug === slug);
  if (!product) notFound();

  const category =
    catalog.categories.find((entry) => entry.id === product.categoryId) ?? null;
  /**
   * Five related products, because the full-width grid is five columns and a four-card row would leave
   * an empty track under a product (owner decision, 2026-10-23: five across). A category with fewer
   * products shows fewer cards - the row is never padded.
   */
  const related = catalog.products
    .filter((item) => item.categoryId === product.categoryId && item.id !== product.id)
    .slice(0, 5);

  return <ProductDetailView product={product} category={category} related={related} />;
}
