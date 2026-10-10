import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductBySlug, products } from '@/data/catalog';
import { ProductDetailView } from '@/features/catalog/ProductDetailView';

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: 'পণ্য' };
  return {
    title: product.name.bn ?? product.name.en ?? slug,
    description: product.description.bn ?? product.description.en ?? undefined,
  };
}

/**
 * Product detail route. Unknown slugs return a real 404 rather than a blank
 * product page, and all product data is resolved on the server.
 */
export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();
  return <ProductDetailView product={product} />;
}
