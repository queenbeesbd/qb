import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { countReviewsForAdmin, listReviewsForAdmin } from '@/server/reviews/service';
import { ReviewsView, type ReviewNotice, type ReviewTab } from './ReviewsView';

export const dynamic = 'force-dynamic';

const TABS: readonly ReviewTab[] = ['pending', 'approved', 'rejected'];

const NOTICES: readonly ReviewNotice[] = ['published', 'refused', 'conflict', 'invalid', 'denied'];

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
    return { rows, counts: { pending, approved, rejected } };
  });

  return (
    <ReviewsView
      tab={tab}
      reviews={data.rows.map((row) => ({
        id: row.id,
        productName: row.productName,
        productSlug: row.productSlug,
        customerEmail: row.customerEmail,
        ratingHalves: row.ratingHalves,
        body: row.body,
        imageKey: row.imageKey,
        createdAt: row.createdAt.toISOString(),
        decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString(),
      }))}
      counts={data.counts}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
