'use client';

import Link from 'next/link';
import { discountAmount } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { CategoryIcon, InfoIcon } from '@/components/icons';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import {
  HOMEPAGE_SECTION_SIZE,
  RECENT_LIMIT,
  selectHeroProducts,
  selectRecentlyAdded,
} from './recent';
import { ProductPhoto } from '@/components/ProductPhoto';
import styles from '@/app/home.module.css';

/*
 * The hero photographs are the catalog's three newest products (owner decision, Phase 26 revision),
 * ordered newest first and taken from the same ordering rule as "Recently added". They used to be a
 * hand-picked slug list, which was curation wearing the look of a product edit; recency is now a real
 * stored fact, so the composition follows the catalog instead of a constant.
 */

/**
 * How many products "More to explore" publishes: two rows of the five-column desktop grid.
 *
 * It is a browse row, not a fixed selection, so it takes the shop's own collection first and then the
 * rest of the catalog that the rows above have not shown. A shorter catalog shows fewer cards rather
 * than a repeat; today the seed leaves seven.
 */
const EXPLORE_LIMIT = 10;

/**
 * Homepage composition.
 *
 * Every product, category and curation id arrives as a server-resolved prop from one catalog snapshot;
 * this view never reads the database itself. Each selection is presented as what it is - the owner's
 * curated featured row, a row derived from published comparison prices, a recency selection ordered by
 * the stored creation timestamp (D6), or the rest of the catalog.
 *
 * **Order revised 2026-10-23 (owner decision).** Hero, categories, then featured, offers, recently added
 * and finally "More to explore". The shop's own recommendation leads because it is the strongest thing
 * the page can say, and the whole-catalog row closes the page with a way out rather than an ending.
 *
 * **The featured row is a plain grid of five, not a carousel.** It publishes exactly one row, so there is
 * nothing off screen: the previous/next controls and the horizontal bar under the row existed only to
 * reach a sixth card that did not fit. One row of five is the whole selection.
 *
 * **Every fixed selection publishes five.** The full-width grid is five columns from 1200px, so five
 * completes a row exactly; on a phone the two-column grid lets the final card take the row rather than
 * leaving a hole. "More to explore" is the exception at ten, because it is a browse row rather than a
 * selection, and it ends with a button into the full catalog.
 *
 * Selections never repeat a product across sections. Recency cannot be filtered (it is a fact about the
 * catalog, not a choice), so the other rows yield to it wherever it is rendered: the featured row, the
 * offer row and the browse row all drop anything already shown as new. That ordering is about data, not
 * layout - moving the recency section down the page does not let a curated row claim a newer product.
 */
export function HomeView({
  products,
  categories,
  featuredIds,
  collectionIds,
}: {
  products: readonly CatalogItem[];
  categories: readonly CatalogCategory[];
  featuredIds: readonly string[];
  collectionIds: readonly string[];
}) {
  const { t, pick } = useTranslation();

  const productById = new Map(products.map((product) => [product.id, product]));
  const resolve = (ids: readonly string[]): CatalogItem[] =>
    ids
      .map((id) => productById.get(id))
      .filter((product): product is CatalogItem => Boolean(product));

  const recentlyAdded = selectRecentlyAdded(products);
  const recentIds = new Set(recentlyAdded.map((product) => product.id));

  const featured = resolve(featuredIds)
    .filter((product) => !recentIds.has(product.id))
    .slice(0, HOMEPAGE_SECTION_SIZE);
  const featuredShown = new Set(featured.map((product) => product.id));

  /**
   * The offer row is derived rather than curated, so a short row means the catalog genuinely has fewer
   * discounted products left to show - never a padded one. It yields to recency (a fact) and to the
   * featured row (a choice shown above it).
   */
  const deals = products
    .filter(
      (product) =>
        !recentIds.has(product.id) &&
        !featuredShown.has(product.id) &&
        discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null,
    )
    .sort(
      (a, b) =>
        discountAmount(b.priceMinor, b.compareAtPriceMinor)! -
        discountAmount(a.priceMinor, a.compareAtPriceMinor)!,
    )
    .slice(0, HOMEPAGE_SECTION_SIZE);

  /**
   * "More to explore": the shop's own collection first, then everything else the rows above did not
   * show, capped at two desktop rows. It is the only section allowed to be longer than one row, and the
   * only one with a button rather than a text link - it is the way out of the page.
   */
  const shownIds = new Set(
    [...recentlyAdded, ...featured, ...deals].map((product) => product.id),
  );
  const curatedRest = resolve(collectionIds).filter((product) => !shownIds.has(product.id));
  const curatedRestIds = new Set(curatedRest.map((product) => product.id));
  const remainder = products.filter(
    (product) => !shownIds.has(product.id) && !curatedRestIds.has(product.id),
  );
  const explore = [...curatedRest, ...remainder].slice(0, EXPLORE_LIMIT);

  const heroProducts = selectHeroProducts(products);
  const isEmpty = products.length === 0;

  return (
    <div className={styles.page}>
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
          <div className={styles.heroCollage}>
            <ul className={styles.collageList}>
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
                      sizes="(max-width: 719px) 30vw, 260px"
                      priority={index === 0}
                      className={styles.collagePhoto}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section
        className={`${styles.section} ${styles.categoriesSection}`}
        aria-labelledby="categories-title"
        id="categories"
      >
        <header className={styles.sectionHeader}>
          <div>
            <h2 id="categories-title">{t('home.categoriesTitle')}</h2>
            <p className={styles.sectionBody}>{t('home.categoriesBody')}</p>
          </div>
          <Link className={styles.viewAll} href="/categories">
            {t('home.viewAll')}
          </Link>
        </header>
        <ul className={styles.categoryGrid}>
          {categories.map((category, index) => (
            <li
              key={category.id}
              /* An odd category count would strand one card on a phone; the last one takes the row. */
              className={styles.categoryItem}
              data-fill={categories.length % 2 === 1 && index === categories.length - 1 ? 'true' : undefined}
            >
              <Link className={styles.categoryCard} href={`/categories/${category.slug}`}>
                <span className={styles.categoryIcon}>
                  <CategoryIcon name={category.icon} width={24} height={24} />
                </span>
                <span className={styles.categoryText}>
                  <span className={styles.categoryName}>{pick(category.name)}</span>
                  <span className={styles.categoryBlurb}>{pick(category.blurb)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/*
        When the catalog has no products at all, every selection below has nothing to draw from.
        Rather than repeat the same "nothing to show" note four times, the gap is stated once.
      */}
      {isEmpty ? (
        <section className={styles.section} aria-labelledby="empty-catalog-title">
          <EmptyNote
            title={t('catalog.emptyCatalogTitle')}
            body={t('catalog.emptyCatalogBody')}
          />
        </section>
      ) : (
        <>
          {/*
            The owner's recommendation leads. There is no "View all" and no controls: the row is the
            whole selection, one per department, so a link beside it would promise more of a thing that
            is complete.
          */}
          {featured.length > 0 && (
            <section className={styles.section} aria-labelledby="featured-title">
              <header className={styles.sectionHeader}>
                <div>
                  <h2 id="featured-title">{t('home.featuredTitle')}</h2>
                  <p className={styles.sectionBody}>{t('home.featuredBody')}</p>
                </div>
              </header>
              <ProductGrid>
                {featured.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
            </section>
          )}

          {/*
            The offer row follows the recommendation rather than leading, because a discount is only
            interesting when there is something to be discounted against. It is derived from published
            comparison prices, so a short or empty row states a real gap instead of guessing.
          */}
          <section className={styles.section} aria-labelledby="deals-title">
            <header className={styles.sectionHeader}>
              <div>
                <h2 id="deals-title">{t('home.dealsTitle')}</h2>
                <p className={styles.sectionBody}>{t('home.dealsBody')}</p>
              </div>
            </header>
            {deals.length > 0 ? (
              <ProductGrid>
                {deals.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
            ) : (
              <EmptyNote title={t('home.dealsEmptyTitle')} body={t('home.dealsEmptyBody')} />
            )}
          </section>

          {/*
            "Recently added" (D6, Phase 26). Ordered by the stored creation timestamp, not by list
            position, so the claim in the heading is backed by data rather than by layout. The section is
            omitted entirely when the source cannot date its products, and states a shorter gap when only
            some can be dated - it never pads the row with a repeated card or an invented entry.
          */}
          {recentlyAdded.length > 0 && (
            <section className={styles.section} aria-labelledby="recently-added-title">
              <header className={styles.sectionHeader}>
                <div>
                  <h2 id="recently-added-title">{t('home.recentTitle')}</h2>
                  <p className={styles.sectionBody}>
                    {recentlyAdded.length < RECENT_LIMIT
                      ? t('home.recentBodyPartial', { count: recentlyAdded.length })
                      : t('home.recentBody')}
                  </p>
                </div>
                <Link className={styles.viewAll} href="/products">
                  {t('home.viewAll')}
                </Link>
              </header>
              <ProductGrid>
                {recentlyAdded.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
            </section>
          )}

          {/*
            The browse row closes the page: the shop's collection first, then the rest of the catalog,
            up to two rows. It is deliberately the only section with a button, and that button goes to
            the full catalog - which is where a shopper who is still browsing wants to land.
          */}
          {explore.length > 0 && (
            <section className={styles.section} aria-labelledby="collection-title">
              <header className={styles.sectionHeader}>
                <div>
                  <h2 id="collection-title">{t('home.collectionTitle')}</h2>
                  <p className={styles.sectionBody}>{t('home.collectionBody')}</p>
                </div>
              </header>
              <ProductGrid>
                {explore.map((product) => (
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

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyNote}>
      <InfoIcon width={22} height={22} />
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        <p className={styles.emptyBody}>{body}</p>
      </div>
    </div>
  );
}
