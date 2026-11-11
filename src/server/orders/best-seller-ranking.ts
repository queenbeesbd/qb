import { withTransaction } from '@/db/client';
import { listBestSellingProductIds } from '@/server/orders/best-sellers';

/**
 * The shop's real ranking, for a listing sorted by "Best selling".
 *
 * Only the `best-selling` sort asks for it, so a listing read does not pay for a ranking nobody chose.
 * The number is the depth of the ranking: every product the shop has actually sold, most units first,
 * which is what "see all best sellers" can honestly mean. `listBestSellingProductIds` reads the shop's
 * own order lines - never a curation - and excludes cancelled orders.
 */
export async function bestSellerRankingFor(sort: string): Promise<readonly string[]> {
  if (sort !== 'best-selling') return [];
  return withTransaction((tx) => listBestSellingProductIds(tx, 200));
}
