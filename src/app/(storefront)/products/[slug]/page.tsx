import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailView } from '@/features/catalog/ProductDetailView';
import { withTransaction } from '@/db/client';
import { getProductDescription, getStorefrontCatalog } from '@/server/catalog/storefront';
import { publicBaseUrl } from '@/server/integrations/email';
import { loadSupportLinks } from '@/server/settings/support';
import { productOrderMessage, whatsappOrderHref } from '@/lib/whatsapp-order';
import { currentCustomerPrincipal } from '@/server/customer-auth/guard';
import {
  countPublishedReviews,
  getOwnReview,
  listPublishedReviews,
  reviewEligibility,
} from '@/server/reviews/service';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ review?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { products } = await getStorefrontCatalog();
  const product = products.find((entry) => entry.slug === slug);
  if (!product) return { title: 'Product' };
  /*
   * The snapshot carries no descriptions (they are most of its bytes and only this route renders one),
   * so the meta description comes from the one-row read the page also uses.
   */
  const description = await getProductDescription(slug);
  return {
    title: product.name.bn ?? product.name.en ?? slug,
    description: description?.bn ?? description?.en ?? undefined,
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
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { review: reviewNotice } = await searchParams;
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

  const description = (await getProductDescription(slug)) ?? { bn: null, en: null };

  /*
   * Reviews, read for this page and this viewer.
   *
   * Published reviews are public; the viewer's own review and whether they may write one depend on
   * the session, which is why this block is per request rather than part of the cached catalog
   * snapshot. A signed-out visitor reads the public list and is offered no form - the form has to be
   * earned by an order, and the POST re-checks that from the database anyway.
   */
  /**
   * The "Order on WhatsApp" link (owner direction, 2026-11-12).
   *
   * It is built from the owner's own `support.whatsapp_url` and nothing else: no number is stored in
   * code, and a link that is not WhatsApp's own host yields `null`, so no button is drawn. The product
   * name, pack and absolute URL are the message, so the shop can answer without asking which item.
   */
  const support = await withTransaction((tx) => loadSupportLinks(tx));
  const base = publicBaseUrl();
  const orderWhatsappHref = whatsappOrderHref(
    support.whatsappUrl,
    productOrderMessage({
      name: product.name.en ?? product.name.bn ?? product.slug,
      pack: product.pack,
      url: base === null ? null : `${base}/products/${encodeURIComponent(product.slug)}`,
    }),
  );

  const principal = await currentCustomerPrincipal();
  const productId = Number(product.id);
  const reviewData = await withTransaction(async (tx) => {
    const published = await listPublishedReviews(tx, productId);
    const totalPublished = await countPublishedReviews(tx, productId);
    if (principal === null) {
      return { published, totalPublished, ownReview: null, canReview: false };
    }
    const ownReview = await getOwnReview(tx, principal.customerId, productId);
    const eligibility =
      ownReview === null ? await reviewEligibility(tx, principal.customerId, productId) : null;
    return {
      published,
      totalPublished,
      ownReview,
      canReview: eligibility?.allowed === true,
    };
  });

  return (
    <ProductDetailView
      product={product}
      description={description}
      category={category}
      related={related}
      reviews={reviewData.published.map((entry) => ({
        ratingHalves: entry.ratingHalves,
        body: entry.body,
        createdAt: entry.createdAt.toISOString(),
        imageKey: entry.imageKey,
      }))}
      totalPublished={reviewData.totalPublished}
      ownReview={
        reviewData.ownReview === null
          ? null
          : {
              ratingHalves: reviewData.ownReview.ratingHalves,
              body: reviewData.ownReview.body,
              createdAt: reviewData.ownReview.createdAt.toISOString(),
              imageKey: reviewData.ownReview.imageKey,
              state: reviewData.ownReview.state,
            }
      }
      canReview={reviewData.canReview}
      signedIn={principal !== null}
      csrfToken={principal?.csrfToken ?? null}
      reviewAction={`/api/products/${encodeURIComponent(product.slug)}/reviews`}
      reviewNotice={reviewNotice ?? null}
      orderWhatsappHref={orderWhatsappHref}
    />
  );
}
