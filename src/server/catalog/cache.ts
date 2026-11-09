/**
 * Cache identity for the storefront catalog snapshot.
 *
 * The snapshot is large (every published product, its images, its variant price, every visible brand
 * and category), so reading it once per request is the dominant source of database egress. It is
 * cached across requests and invalidated by every catalog write; the TTL is only a backstop.
 *
 * The tag string and the invalidation helper live together so a writer cannot expire a different
 * tag from the one the reader assigned.
 */
import { revalidateTag } from 'next/cache';

export const STOREFRONT_CATALOG_TAG = 'storefront-catalog';

/**
 * Backstop revalidation interval, in seconds. Catalog writes invalidate the tag immediately.
 *
 * **One hour, not five minutes (2026-11-10).** Neon's Free plan allows 5 GB of public network transfer
 * per project per month, and this snapshot is ~0.8 MB of rows: refreshing it every five minutes was
 * the shop's dominant egress cost (production had used 2.3 GB in its first three days). The tag
 * invalidation is what keeps the storefront correct after an owner edit - the archive, the availability
 * switch and the product save all expire the tag in the same deployment - so this interval only bounds
 * how stale a snapshot can be if an invalidation is ever lost. One hour keeps that bound tight while
 * cutting refreshes by 12x. `docs/project-status.md` records the measurement and the estimate.
 */
export const STOREFRONT_CATALOG_REVALIDATE_SECONDS = 60 * 60;

/**
 * Expires the cached snapshot after a committed catalog write.
 *
 * `expire: 0` means the next storefront request waits for fresh rows instead of serving the old
 * snapshot once more, so an owner who changes stock or a photograph sees it on the next page.
 */
export function invalidateStorefrontCatalog(): void {
  revalidateTag(STOREFRONT_CATALOG_TAG, { expire: 0 });
}
