/**
 * What the shop has actually sold most of.
 *
 * **This is a fact about the shop's own order lines, not a curation.** "Most Selling" on the homepage is
 * a claim, and the only honest source for it is `order_item.quantity` joined to the product it names -
 * nothing here is hand-picked, nothing is promoted, and a shop that has never sold anything returns an
 * empty list rather than a plausible-looking ranking.
 *
 * Two exclusions, both deliberate:
 *
 * - **A cancelled order never counts.** Those units were not sold: the order was withdrawn before
 *   dispatch, and the number is a record of interest, not of trade.
 * - **An archived or unpublished product is dropped** by the caller, because the homepage can only
 *   show cards the storefront actually sells.
 *
 * Ties break on the product id so the row is deterministic between identical requests; without it, two
 * products with one unit each could swap places every time the planner felt like it.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, orderItem, product, productVariant } from '@/db/schema';

export async function listBestSellingProductIds(
  tx: Transaction,
  limit: number,
): Promise<string[]> {
  const rows = await tx
    .select({
      productId: product.id,
      units: sql<number>`sum(${orderItem.quantity})::int`,
    })
    .from(orderItem)
    .innerJoin(productVariant, sql`${productVariant.id} = ${orderItem.variantId}`)
    .innerJoin(product, sql`${product.id} = ${productVariant.productId}`)
    .innerJoin(order, sql`${order.id} = ${orderItem.orderId}`)
    .where(
      sql`${order.status} <> 'cancelled'
          and ${product.deletedAt} is null
          and ${product.isPublished}`,
    )
    .groupBy(product.id)
    .orderBy(sql`sum(${orderItem.quantity}) desc`, product.id)
    /*
     * The homepage asks for ten; a listing sorted by "Best selling" asks for the whole ranking, so the
     * cap is a bound on one aggregate query rather than a page size. It stays capped because a crafted
     * caller should not be able to ask for every product the shop has ever sold in one row set.
     */
    .limit(Math.min(Math.max(limit, 1), 500));

  return rows.map((row) => String(row.productId));
}
