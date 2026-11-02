'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/useTranslation';
import { CARD_FRAME, CATEGORY_RAIL_SIZES } from '@/lib/images';
import type { CatalogBrand, CatalogCategory, CatalogItem } from '@/lib/types';
import { ArrowIcon, CategoryIcon, InfoIcon, SparkIcon } from '@/components/icons';
import { BrandMark, DiscoveryPhoto } from '@/components/DiscoveryPhoto';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { ProductPhoto } from '@/components/ProductPhoto';
import { OfferCarousel } from './home/OfferCarousel';
import styles from '@/app/home.module.css';

/**
 * Homepage composition.
 *
 * **Mobile first, and the order is the mobile order.** A shopper on a phone lands on a headline they
 * can read at a glance, then goes straight to what is on offer - the one thing a shop has to say that
 * the product page cannot - then to the department rail, then to the shop's picks, then to brands,
 * then to what is new. Every section above "Featured" is one screen or less; none of them is a
 * full-height banner that makes a customer scroll before they see a price.
 *
 * **Every selection is server-resolved.** `home-selection.ts` decides what each row holds from one
 * catalog snapshot, and this view receives only the cards. It never reads a product list, never picks
 * a product, and never invents one: an empty selection is stated as the gap it is.
 *
 * **The order of the rows below the hero is revised for this redesign** (it used to be hero,
 * categories, featured, offers, recently added, more). Offers now lead - they are the strongest
 * commercial statement the shop can make - the category rail follows immediately (it is the only
 * category discovery a phone gets), and the page closes with new arrivals and a way into everything.
 */
export function HomeView({
  departments,
  heroProducts,
  featured,
  deals,
  newArrivals,
  browse,
  brands,
  isEmpty,
}: {
  departments: readonly CatalogCategory[];
  heroProducts: readonly CatalogItem[];
  featured: readonly CatalogItem[];
  deals: readonly CatalogItem[];
  newArrivals: readonly CatalogItem[];
  browse: readonly CatalogItem[];
  brands: readonly CatalogBrand[];
  isEmpty: boolean;
}) {
  const { t, pick, price } = useTranslation();
  const lead = heroProducts[0];

  return (
    <div className={styles.page}>
      {/*
        Hero.

        **On a phone it is a compact band, not a full-screen banner.** A headline, one line about
        what the shop sells, two actions, and then the newest product as a *spotlight row* - a small
        photograph with its name and price beside it. That puts a real, purchasable product on the
        first screen, above the offer shelf, instead of asking a customer to scroll a photograph
        before they see a price.

        **From 1024px it is the three-frame composition**, with the copy on the left: there is room
        for the photographs to carry the section, and the spotlight row would be redundant beside
        them. One of the two is always rendered; neither is a fallback for the other.
      */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <h1 id="hero-title" className={styles.heroTitle}>
            {t('home.heroTitle')}
          </h1>
          <p className={styles.heroBody}>{t('home.heroBody')}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/products">
              {t('home.heroPrimary')}
            </Link>
            <Link className={styles.secondaryAction} href="/categories">
              {t('home.heroSecondary')}
            </Link>
          </div>
        </div>

        {heroProducts.length > 0 && (
          <div className={styles.heroMedia}>
            {/*
              The phone's spotlight: the newest product, its price, and one tap to its page. It is
              the same record the desktop collage draws - the catalog's newest - so the two sizes
              can never disagree about what the shop added last.
            */}
            <ul className={styles.spotlight} data-hero-spotlight>
              {heroProducts.slice(0, 2).map((product, index) => (
                <li key={product.id} className={styles.spotlightItem}>
                  <Link
                    className={styles.spotlightLink}
                    href={`/products/${product.slug}`}
                    aria-label={pick(product.name) ?? product.slug}
                  >
                    <span className={styles.spotlightPhoto}>
                      <ProductPhoto
                        image={product.images[0]}
                        alt=""
                        sizes="112px"
                        priority={index === 0}
                        frame="1 / 1"
                      />
                    </span>
                    <span className={styles.spotlightText}>
                      <span className={styles.spotlightKicker}>{t('home.newArrivalsTitle')}</span>
                      <span className={styles.spotlightName}>{pick(product.name) ?? product.slug}</span>
                      <span className={styles.spotlightPrice}>{price(product.priceMinor)}</span>
                    </span>
                    <span className={styles.spotlightChevron} aria-hidden="true">
                      <ArrowIcon width={16} height={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className={styles.heroCollage}>
              <ul className={styles.collageList} data-hero-collage>
                {heroProducts.map((product, index) => (
                  <li
                    key={product.id}
                    className={styles.collageItem}
                    data-position={index === 0 ? 'lead' : index === 1 ? 'second' : 'third'}
                  >
                    <Link
                      href={`/products/${product.slug}`}
                      className={styles.collageLink}
                      aria-label={pick(product.name) ?? product.slug}
                    >
                      <ProductPhoto
                        image={product.images[0]}
                        alt={pick(product.name) ?? product.slug}
                        sizes="(max-width: 1023px) 30vw, 300px"
                        priority={index === 0}
                        className={styles.collagePhoto}
                        frame={CARD_FRAME}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
              {lead !== undefined && (
                /* The lead frame carries its name and price: a photograph alone is not a product. */
                <Link className={styles.heroLead} href={`/products/${lead.slug}`}>
                  <span className={styles.heroLeadName}>{pick(lead.name) ?? lead.slug}</span>
                  <span className={styles.heroLeadPrice}>{price(lead.priceMinor)}</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {isEmpty ? (
        <section className={styles.section} aria-labelledby="empty-catalog-title">
          <EmptyNote title={t('catalog.emptyCatalogTitle')} body={t('catalog.emptyCatalogBody')} />
        </section>
      ) : (
        <>
          {/*
            Offers lead. The row is a swipeable shelf on a phone and a two-row slider on a desktop,
            because a discount is the one message a shopper should not have to scroll to find.
          */}
          {deals.length > 0 && (
            <section className={styles.section} aria-labelledby="deals-title">
              <SectionHeader
                id="deals-title"
                title={t('home.dealsTitle')}
                body={t('home.dealsBody')}
                href="/products?sort=price-asc"
                linkLabel={t('home.dealsViewAll')}
                accent
              />
              <OfferCarousel products={deals} />
            </section>
          )}

          {/*
            The department rail. A horizontal strip of square photographs on a phone, a grid from
            1024px - the shape the reference uses, and the reason the category index no longer needs to
            be the only way to find a department on a small screen.
          */}
          {departments.length > 0 && (
            <section className={styles.section} aria-labelledby="categories-title" id="categories">
              <SectionHeader
                id="categories-title"
                title={t('home.categoriesTitle')}
                body={t('home.categoriesBody')}
                href="/categories"
                linkLabel={t('home.viewAll')}
              />
              <ul className={styles.categoryRail} data-category-rail>
                {departments.map((category) => (
                  <li key={category.id} className={styles.categoryRailItem}>
                    <Link className={styles.categoryRailLink} href={`/categories/${category.slug}`}>
                      <CatalogCategoryTile category={category} />
                      <span className={styles.categoryRailName}>{pick(category.name)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            The owner's picks ("Featured products"). A plain row of five, as it has been since the
            owner's own decision: the selection is complete, so there is nothing off screen to scroll
            to and no control to operate.
          */}
          {featured.length > 0 && (
            <section className={styles.section} aria-labelledby="featured-title">
              <SectionHeader
                id="featured-title"
                title={t('home.featuredTitle')}
                body={t('home.featuredBody')}
                icon
              />
              <ProductGrid>
                {featured.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
            </section>
          )}

          {/*
            Brands. The tile is the brand's own mark, or its initials when the shop has no logo - the
            fallback is named in the section's own sentence so nobody mistakes it for broken artwork.
          */}
          {brands.length > 0 && (
            <section className={styles.section} aria-labelledby="brands-title">
              <SectionHeader
                id="brands-title"
                title={t('home.brandTitle')}
                body={t('home.brandBody')}
                href="/brands"
                linkLabel={t('home.brandsAll')}
              />
              <ul className={styles.brandRail} data-brand-rail>
                {brands.map((brand) => (
                  <li key={brand.id} className={styles.brandRailItem}>
                    <Link className={styles.brandRailLink} href={`/brands/${brand.slug}`}>
                      <BrandMark
                        logoKey={brand.logoKey}
                        name={pick(brand.name) ?? brand.slug}
                        slug={brand.slug}
                        sizes="96px"
                      />
                      <span className={styles.brandRailName}>{pick(brand.name) ?? brand.slug}</span>
                      <span className={styles.brandRailCount}>
                        {brand.productCount === 1
                          ? t('categories.brandCountOne')
                          : t('categories.brandCount', { count: brand.productCount })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            New arrivals. Ordered by the stored creation timestamp, and omitted entirely when the
            source cannot date its products - it never pads a card or invents an arrival order.
          */}
          {newArrivals.length > 0 && (
            <section className={styles.section} aria-labelledby="recently-added-title">
              <SectionHeader
                id="recently-added-title"
                title={t('home.recentTitle')}
                body={
                  newArrivals.length < 5
                    ? t('home.recentBodyPartial', { count: newArrivals.length })
                    : t('home.recentBody')
                }
                href="/products?sort=newest"
                linkLabel={t('home.newArrivalsAll')}
              />
              <ProductGrid>
                {newArrivals.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
            </section>
          )}

          {browse.length > 0 && (
            <section className={styles.section} aria-labelledby="collection-title">
              <SectionHeader
                id="collection-title"
                title={t('home.collectionTitle')}
                body={t('home.collectionBody')}
              />
              <ProductGrid>
                {browse.map((product) => (
                  <ProductCard key={product.id} product={product} />
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
    </div>
  );
}

/**
 * One section's heading: what it is, one sentence of what it holds, and - when there is more -
 * exactly one way in. The link is a real 40px control so it is reachable with a thumb.
 */
function SectionHeader({
  id,
  title,
  body,
  href,
  linkLabel,
  accent = false,
  icon = false,
}: {
  id: string;
  title: string;
  body?: string;
  href?: string;
  linkLabel?: string;
  /** A small spark beside the title, for the shop's own selection. Decorative, never a rating. */
  accent?: boolean;
  icon?: boolean;
}) {
  return (
    <header className={styles.sectionHeader} data-accent={accent ? 'true' : undefined}>
      <div className={styles.sectionHeaderText}>
        <h2 id={id}>
          {icon && (
            <span className={styles.titleIcon} aria-hidden="true">
              <SparkIcon width={16} height={16} />
            </span>
          )}
          {title}
        </h2>
        {body !== undefined && <p className={styles.sectionBody}>{body}</p>}
      </div>
      {href !== undefined && linkLabel !== undefined && (
        <Link className={styles.viewAll} href={href}>
          {linkLabel}
          <ArrowIcon width={14} height={14} />
        </Link>
      )}
    </header>
  );
}

/**
 * A category's square photograph, or its icon glyph when it has none.
 *
 * The tile is a fixed square and the name sits under it, so a rail of them scans in one movement
 * whatever mix of photographed and un-photographed departments the catalog holds.
 */
function CatalogCategoryTile({ category }: { category: CatalogCategory }) {
  const { pick } = useTranslation();
  return (
    <span className={styles.categoryTile}>
      <DiscoveryPhoto
        imageKey={category.imageKey}
        alt=""
        sizes={CATEGORY_RAIL_SIZES}
        className={styles.categoryTilePhoto}
        fallback={
          <span className={styles.categoryTileGlyph}>
            <CategoryIcon name={category.icon} width={30} height={30} />
          </span>
        }
      />
      <span className="sr-only">{pick(category.name)}</span>
    </span>
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
