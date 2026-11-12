import type { Metadata } from 'next';
import { HomeView } from '@/features/catalog/HomeSections';
import { HOMEPAGE_BEST_SELLER_DEPTH, selectHomepage } from '@/features/catalog/home-selection';
import { getStorefrontCatalog } from '@/server/catalog/storefront';
import { getHomepageExtras } from '@/server/catalog/storefront-extras';
import { isCampaignRenderable, loadCampaign } from '@/server/settings/campaign';

export const metadata: Metadata = {
  title: 'QueenBee’s — Cosmetics storefront',
};

/**
 * Homepage. Every product, category and curated selection is read from the
 * authoritative catalog on the server, so no fabricated marketing claim can
 * appear here and an empty catalog is stated as the gap it is.
 *
 * The five selections are resolved here rather than in the view: the page has
 * always read the whole catalog, and passing it to the client meant the browser
 * downloaded all 1,477 products to draw twenty-eight cards.
 */
export default async function HomePage() {
  const catalog = await getStorefrontCatalog();
  /**
   * The campaign band's content is the owner's, read from `store_setting` alongside the
   * announcement the layout loads. Nothing saved and switched on means no band: the section is
   * absent, never a placeholder.
   *
   * The best-seller ranking is read here, in the same transaction, from the shop's own order lines.
   * It is a fact about traded units, so it is never derived from a curation or from a client value.
   */
  /*
   * Four tiny reads, cached under the storefront tag (`storefront-extras.ts`): this page is the busiest
   * one in the shop, and these rows change when the owner saves a setting or an order completes, not per
   * visitor.
   */
  const { campaign, heroImages, bestSellerIds, support } = await getHomepageExtras(
    HOMEPAGE_BEST_SELLER_DEPTH,
  );

  const selection = selectHomepage({
    products: catalog.products,
    categories: catalog.categories,
    brands: catalog.brands,
    featuredIds: catalog.featuredIds,
    collectionIds: catalog.collectionIds,
    bestSellerIds,
    picks: catalog.picks,
  });

  return (
    <HomeView
      departments={selection.departments}
      departmentsHaveMore={selection.departmentsHaveMore}
      heroImages={heroImages.map((image) => ({
        id: image.id,
        imageKey: image.imageKey,
        altText: image.altText,
      }))}
      deals={selection.deals}
      dealsHaveMore={selection.dealsHaveMore}
      bestSellers={selection.bestSellers}
      bestSellersHaveMore={selection.bestSellersHaveMore}
      newArrivals={selection.newArrivals}
      newArrivalsHaveMore={selection.newArrivalsHaveMore}
      browse={selection.browse}
      brands={selection.brands}
      brandsHaveMore={selection.brandsHaveMore}
      isEmpty={selection.isEmpty}
      support={support}
      campaign={
        isCampaignRenderable(campaign)
          ? { headline: campaign.headline ?? '', body: campaign.body, link: campaign.link }
          : null
      }
    />
  );
}
