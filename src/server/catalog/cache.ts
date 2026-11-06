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

/** Backstop revalidation interval, in seconds. Catalog writes invalidate the tag immediately. */
export const STOREFRONT_CATALOG_REVALIDATE_SECONDS = 300;

/**
 * Expires the cached snapshot after a committed catalog write.
 *
 * `expire: 0` means the next storefront request waits for fresh rows instead of serving the old
 * snapshot once more, so an owner who changes stock or a photograph sees it on the next page.
 */
export function invalidateStorefrontCatalog(): void {
  revalidateTag(STOREFRONT_CATALOG_TAG, { expire: 0 });
}
