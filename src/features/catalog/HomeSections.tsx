'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '@/lib/types';
import { InfoIcon } from '@/components/icons';
import { Carousel } from '@/components/Carousel';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { SupportButtons } from '@/components/SupportButtons';
import { BrandCircleRail } from './home/BrandCircleRail';
import { CampaignBand } from './home/CampaignBand';
import { CategoryCircleRail } from './home/CategoryCircleRail';
import { HeroCarousel, type HeroSlide } from './home/HeroCarousel';
import { SeeAllCard } from './home/SeeAllCard';
import styles from '@/app/home.module.css';

/**
 * Homepage composition.
 *
 * **The order is the owner's (2026-11-05):** hero, Shop By Category, Shop By Brand, On Offer, Most
 * Selling, Recently Added, More To Explore. Discovery comes before merchandise on purpose - a shopper
 * who does not yet know what they want is met with departments and brands, and the shelves follow.
 *
 * **Every product card is the same card.** One portrait 4:5 frame at every width and in every section
 * (`CARD_FRAME`), and the homepage rows carry the card's own add-to-cart control, because the homepage
 * is where a customer starts buying rather than where they browse a filtered list.
 *
 * **Section headings are centred and title-cased**, and each carries at most one route into its full
 * listing beneath the title.
 *
 * **Nothing explains itself.** A shopper does not need a caption to read a shelf of products.
 *
 * **Every selection is server-resolved.** `home-selection.ts` decides what each row holds from one
 * catalog snapshot (and, for Most Selling, from the shop's own order lines), and this view receives
 * only the cards. It never reads a product list, never picks a product and never invents one: an empty
 * selection is stated as the gap it is.
 */
export function HomeView({
  departments,
  departmentsHaveMore,
  heroImages,
  deals,
  dealsHaveMore,
  bestSellers,
  bestSellersHaveMore,
  newArrivals,
  newArrivalsHaveMore,
  browse,
  brands,
  brandsHaveMore,
  isEmpty,
  campaign,
  support,
}: {
  departments: readonly CatalogCategory[];
  /** True when the shop has more departments than the phone rail draws - it then ends in "View all". */
  departmentsHaveMore: boolean;
  heroImages: readonly HeroSlide[];
  deals: readonly CatalogItem[];
  /** The shop has more offers than the row draws - it then ends in an "All offers" tile. */
  dealsHaveMore: boolean;
  /** Products with real order lines, most units first. Empty until the shop has sold something. */
  bestSellers: readonly CatalogItem[];
  /** The shop has more ranked products than the row draws - "All best sellers". */
  bestSellersHaveMore: boolean;
  newArrivals: readonly CatalogItem[];
  /** The shop has more dated products than the row draws - "All new arrivals". */
  newArrivalsHaveMore: boolean;
  browse: readonly CatalogItem[];
  brands: readonly CatalogBrand[];
  /** The brand rail's own "View all" condition - see `departmentsHaveMore`. */
  brandsHaveMore: boolean;
  isEmpty: boolean;
  /**
   * The owner's campaign, resolved server-side from `store_setting`. `null` renders
   * no band - the section is absent, never a placeholder.
   */
  campaign: { headline: string; body: string | null; link: string | null } | null;
  /**
   * The owner's support links, resolved server-side on the homepage only. A link that is not set is
   * `null` and renders no button.
   */
  support: { facebookUrl: string | null; whatsappUrl: string | null };
}) {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      {/*
        The page keeps one h1 even when the owner has not configured a banner: the carousel renders no
        section for an empty table, and a page without a heading would be a missing outline rather than
        an honest gap.
      */}
      <h1 className="sr-only">{t('home.heroTitle')}</h1>

      <HeroCarousel images={heroImages} />

      {isEmpty ? (
        <section className={styles.section} aria-labelledby="empty-catalog-title">
          <EmptyNote title={t('catalog.emptyCatalogTitle')} body={t('catalog.emptyCatalogBody')} />
        </section>
      ) : (
        <>
          {/*
            Where do I start? The circular department rail, first, because it is the question a
            shopper who does not yet know the catalog is asking.
          */}
          {departments.length > 0 && (
            <section className={styles.section} aria-labelledby="categories-title" id="categories">
              <SectionHeader id="categories-title" title={t('home.categoriesTitle')} />
              <CategoryCircleRail categories={departments} hasMore={departmentsHaveMore} />
            </section>
          )}

          {/*
            Who makes it? The same circle, the same row, the brand's own mark.
          */}
          {brands.length > 0 && (
            <section className={styles.section} aria-labelledby="brands-title">
              <SectionHeader id="brands-title" title={t('home.brandTitle')} />
              <BrandCircleRail brands={brands} hasMore={brandsHaveMore} />
            </section>
          )}

          {/*
            Offers: a carousel of the shop's ten largest real savings, each derived from a stored
            comparison price.
          */}
          {deals.length > 0 && (
            <section className={styles.section} aria-labelledby="deals-title">
              <SectionHeader id="deals-title" title={t('home.dealsTitle')} />
              <Carousel label={t('home.dealsTitle')} size="product">
                {deals.map((product) => (
                  <ProductCard key={product.id} product={product} addToCart />
                ))}
                {dealsHaveMore && <SeeAllCard href="/products?offers=1" labelKey="home.dealsViewAll" />}
              </Carousel>
            </section>
          )}

          {/*
            Most Selling is a fact about the shop's own order lines, never a curation: the section is
            drawn from `home-selection.ts`'s best-seller selection, which counts real ordered units.
            A shop that has not sold anything yet omits the section entirely (owner direction,
            2026-11-07): a heading over an empty shelf is a promise the shop cannot keep.
          */}
          {bestSellers.length > 0 && (
            <section className={styles.section} aria-labelledby="best-selling-title">
              <SectionHeader id="best-selling-title" title={t('home.bestSellingTitle')} />
              <Carousel label={t('home.bestSellingTitle')} size="product">
                {bestSellers.map((product) => (
                  <ProductCard key={product.id} product={product} addToCart />
                ))}
                {bestSellersHaveMore && (
                  <SeeAllCard href="/products?sort=best-selling" labelKey="home.bestSellingAll" />
                )}
              </Carousel>
            </section>
          )}

          {/*
            New arrivals. Ordered by the stored creation timestamp, and omitted entirely when the
            source cannot date its products - it never pads a card or invents an arrival order.
          */}
          {newArrivals.length > 0 && (
            <section className={styles.section} aria-labelledby="recently-added-title">
              <SectionHeader id="recently-added-title" title={t('home.recentTitle')} />
              <Carousel label={t('home.recentTitle')} size="product">
                {newArrivals.map((product) => (
                  <ProductCard key={product.id} product={product} addToCart />
                ))}
                {newArrivalsHaveMore && (
                  <SeeAllCard href="/products?sort=newest" labelKey="home.newArrivalsAll" />
                )}
              </Carousel>
            </section>
          )}

          {/*
            The campaign band, between the new-arrivals row and the browse row: a pause that breaks
            the run of product sections with the owner's own seasonal statement. Rendered only when
            the owner has saved and switched on a campaign - `null` means the section is absent.
          */}
          {campaign !== null && (
            <CampaignBand
              headline={campaign.headline}
              body={campaign.body}
              link={campaign.link}
              linkLabel={t('home.campaignCta')}
            />
          )}

          {/*
            More to explore: the last row, and the only section with a button instead of a header
            link. Two full desktop rows of five, and four phone rows of two - an even number at both
            sizes, so no card has to stretch to fill a row.
          */}
          {browse.length > 0 && (
            <section className={styles.section} aria-labelledby="collection-title">
              <SectionHeader id="collection-title" title={t('home.collectionTitle')} />
              <ProductGrid className={styles.browseGrid}>
                {browse.map((product) => (
                  <ProductCard key={product.id} product={product} addToCart />
                ))}
              </ProductGrid>
              <div className={styles.viewMoreRow}>
                <Link className={styles.viewMore} href="/products">
                  {t('home.viewMore')}
                </Link>
              </div>
            </section>
          )}
        </>
      )}

      {/*
        The support rail is a homepage element (owner direction, 2026-11-05): a customer who is
        browsing the shop can reach the owner, but the two outbound links do not follow every product
        page where they competed with the buy action.
      */}
      <SupportButtons facebookUrl={support.facebookUrl} whatsappUrl={support.whatsappUrl} />
    </div>
  );
}

/**
 * One section's heading: what the section is, and - when there is more - exactly one way in. Centred,
 * with the link beneath the title rather than pushed to a corner: the row reads as one announcement,
 * which is the reference the owner pointed at.
 */
function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <header className={styles.sectionHeader}>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyNote}>
      <InfoIcon width={18} height={18} />
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        <p className={styles.emptyBody}>{body}</p>
      </div>
    </div>
  );
}
