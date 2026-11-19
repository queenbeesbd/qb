import { eq, sql } from 'drizzle-orm';

import { withTransaction } from '@/db/client';
import { brand, product } from '@/db/schema';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { countReviewsForAdmin, listReviewsForAdmin } from '@/server/reviews/service';
import { ReviewsView, type ReviewNotice, type ReviewTab } from './ReviewsView';

export const dynamic = 'force-dynamic';

const TABS: readonly ReviewTab[] = ['pending', 'approved', 'rejected'];

const NOTICES: readonly ReviewNotice[] = [
  'published',
  'refused',
  'conflict',
  'invalid',
  'denied',
  'written',
  'writeInvalid',
];

function readTab(value: string | string[] | undefined): ReviewTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (TABS as readonly string[]).includes(candidate)
    ? (candidate as ReviewTab)
    : 'pending';
}

function readNotice(value: string | string[] | undefined): ReviewNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as ReviewNotice)
    : null;
}

/**
 * Commerce -> Reviews (ADR 0035).
 *
 * Requires `review.moderate`: publishing a review puts a customer's words on the shop's own product
 * page, which is a different act from editing the catalog. The queue is read from the same rows the
 * storefront reads, so "published" on this screen and "on the page" can never disagree.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.reviewModerate);
  const params = await searchParams;
  const tab = readTab(params.state);

  const data = await withTransaction(async (tx) => {
    const rows = await listReviewsForAdmin(tx, { state: tab, limit: 50 });
    const pending = await countReviewsForAdmin(tx, 'pending');
    const approved = await countReviewsForAdmin(tx, 'approved');
    const rejected = await countReviewsForAdmin(tx, 'rejected');
    /*
     * The products the owner may attach a review to: published and not archived, which is exactly the
     * set whose product page can draw one. The picker carries the **photograph** as well as the name,
     * because the owner recognises a product by its picture on a confirmation call and by its picture
     * here - a list of names alone is what the owner called unusable (2026-11-19). The image is the
     * same primary-or-first projection the admin product list draws, so a product with no images is
     * the only one that shows an initial instead.
     */
    const products = await tx
      .select({
        id: product.id,
        nameEn: product.nameEn,
        slug: product.slug,
        brandNameEn: brand.nameEn,
        primaryImageKey: sql<string | null>`(
          select "base_key" from "product_image"
          where "product_image"."product_id" = "product"."id"
            and "product_image"."deleted_at" is null
          order by "product_image"."is_primary" desc, "product_image"."sort_order" asc, "product_image"."id" asc
          limit 1
        )`,
      })
      .from(product)
      .innerJoin(brand, eq(brand.id, product.brandId))
      .where(sql`${product.deletedAt} is null and ${product.isPublished}`)
      .orderBy(product.nameEn)
      .limit(500);
    return { rows, counts: { pending, approved, rejected }, products };
  });

  return (
    <ReviewsView
      tab={tab}
      reviews={data.rows.map((row) => ({
        id: row.id,
        productName: row.productName,
        productSlug: row.productSlug,
        customerEmail: row.customerEmail,
        source: row.source,
        ratingHalves: row.ratingHalves,
        body: row.body,
        imageKey: row.imageKey,
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString(),
      }))}
      counts={data.counts}
      products={data.products}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
