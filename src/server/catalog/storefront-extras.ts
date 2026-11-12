/**
 * The small, hot reads the storefront makes around its cached catalog snapshot.
 *
 * The snapshot itself is cached under `storefront-catalog` (see `./cache.ts`), but the homepage and a
 * product page also read a handful of tiny rows every request: the hero banners, the campaign band, the
 * support links, the best-seller ranking and one product's published reviews. At 50-60k visits a month
 * that was four extra round trips per homepage view and one per product view, for data that changes when
 * the owner saves a setting or an order completes.
 *
 * Each of these is cached under the **same tag**, so an owner's save still reaches the next request, and
 * the one-minute backstop bounds staleness if an invalidation is ever missed. Development and the test
 * runner read directly, exactly as the catalog does (`unstable_cache` needs Next's incremental cache,
 * which only exists inside a running server).
 */

import { unstable_cache } from 'next/cache';

import { withTransaction } from '@/db/client';
import { listBestSellingProductIds } from '@/server/orders/best-sellers';
import { countPublishedReviews, listPublishedReviews } from '@/server/reviews/service';
import { loadCampaign, type CampaignSetting } from '@/server/settings/campaign';
import { listHeroImages, type HeroImageRow } from '@/server/settings/hero';
import { loadSupportLinks, type SupportLinks } from '@/server/settings/support';
import { STOREFRONT_CATALOG_TAG } from './cache';

/** One minute, not an hour: a completed order changes the ranking, and that is a visible fact. */
const EXTRAS_REVALIDATE_SECONDS = 60;

export type HomepageExtras = {
  campaign: CampaignSetting;
  heroImages: readonly HeroImageRow[];
  bestSellerIds: readonly string[];
  support: SupportLinks;
};

async function readHomepageExtras(depth: number): Promise<HomepageExtras> {
  return withTransaction(async (tx) => {
    const [campaign, heroImages, bestSellerIds, support] = await Promise.all([
      loadCampaign(tx),
      listHeroImages(tx),
      listBestSellingProductIds(tx, depth),
      loadSupportLinks(tx),
    ]);
    return { campaign, heroImages, bestSellerIds, support };
  });
}

const readHomepageExtrasCached = unstable_cache(readHomepageExtras, ['storefront-home-extras'], {
  tags: [STOREFRONT_CATALOG_TAG],
  revalidate: EXTRAS_REVALIDATE_SECONDS,
});

/** The homepage's four peripheral reads, cached under the storefront tag. */
export function getHomepageExtras(depth: number): Promise<HomepageExtras> {
  return process.env.NODE_ENV === 'production'
    ? readHomepageExtrasCached(depth)
    : readHomepageExtras(depth);
}

async function readReviews(productId: number) {
  return withTransaction(async (tx) => {
    const [published, totalPublished] = await Promise.all([
      listPublishedReviews(tx, productId),
      countPublishedReviews(tx, productId),
    ]);
    return { published, totalPublished };
  });
}

const readReviewsCached = unstable_cache(readReviews, ['storefront-product-reviews'], {
  tags: [STOREFRONT_CATALOG_TAG],
  revalidate: EXTRAS_REVALIDATE_SECONDS,
});

/**
 * One product's published reviews, cached per product id.
 *
 * A customer's **own** pending review is read beside this on the server, uncached, because it is behind
 * a session and must never be shared between visitors.
 */
export function getPublishedReviews(
  productId: number,
): Promise<{ published: Awaited<ReturnType<typeof listPublishedReviews>>; totalPublished: number }> {
  return process.env.NODE_ENV === 'production'
    ? readReviewsCached(productId)
    : readReviews(productId);
}
