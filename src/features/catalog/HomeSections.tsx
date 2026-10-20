'use client';

import Link from 'next/link';
import { discountAmount } from '@/lib/money';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import { CategoryIcon, InfoIcon } from '@/components/icons';
import { ProductCard } from '@/components/ProductCard';
import { ProductGrid } from '@/components/ProductGrid';
import { RECENT_LIMIT, selectHeroProducts, selectRecentlyAdded } from './recent';
import { ProductPhoto } from '@/components/ProductPhoto';
import { FeaturedShelf } from './FeaturedShelf';
import styles from '@/app/home.module.css';

/*
 * The hero photographs are the catalog's three newest products (owner decision, Phase 26 revision),
 * ordered newest first and taken from the same ordering rule as "Recently added". They used to be a
 * hand-picked slug list, which was curation wearing the look of a product edit; recency is now a real
 * stored fact, so the composition follows the catalog instead of a constant.
 */

/**
 * Homepage composition.
 *
 * Every product, category and curation id arrives as a server-resolved prop from
 * one catalog snapshot; this view never reads the database itself. Sections are
 * limited to those the verified data can actually support, and each selection is
 * presented as what it is - the owner's curated shelf, a row derived from
 * published comparison prices, or a recency selection ordered by the stored
 * creation timestamp (D6).
 *
 * The selections are id lists supplied by the server (from the catalog's own
 * curation records); an id that no longer resolves shortens the section instead
 * of breaking the page, and the caps are applied at the source rather than
 * re-derived here.
 *
 * **Three product sections became two (Phase 25).** The audit found the homepage carried the
 * featured shelf, an offer row and a "more to explore" collection - 18 cards across three
 * stacked rows, ~3,700px tall - and that a shopper could not tell the offer row from the
 * curated collection by their headings alone. The collection duplicated the shelf's job
 * (curated products) and the catalog's job (everything else is one click away from every
 * section header and the header navigation), so it was removed rather than restyled. What
 * remains has a distinct reason to exist: the shelf is the owner's curation, the offer row is
 * derived from genuine comparison prices. The collection ids are still curated and still
 * seeded - they are not lost from the data, only from the homepage.
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

  const featured = resolve(featuredIds);
  const recentlyAdded = selectRecentlyAdded(products);
  /**
   * The collection is resolved even though the homepage no longer renders it: its ids still
   * matter here, because the offer row must not repeat a product that already appears on the
   * shelf or in the owner's collection. Dropping the resolution would silently let those two
   * selections collide on the page.
   */
  const collection = resolve(collectionIds);

  /**
   * The offer row complements the shelf above instead of repeating it: products
   * already featured or collected are filtered out, so the same card never
   * appears twice on the homepage. Four is deliberate - the row stays one line on
   * desktop and the full discounted set is still reachable from the catalog.
   */
  const featuredSet = new Set([...featured, ...collection].map((product) => product.id));
  const deals = products
    .filter(
      (product) =>
        !featuredSet.has(product.id) &&
        discountAmount(product.priceMinor, product.compareAtPriceMinor) !== null,
    )
    .sort(
      (a, b) =>
        discountAmount(b.priceMinor, b.compareAtPriceMinor)! -
        discountAmount(a.priceMinor, a.compareAtPriceMinor)!,
    )
    .slice(0, 4);

  const heroProducts = selectHeroProducts(products);

  const isEmpty = products.length === 0;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t('home.heroEyebrow')}</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            {t('home.heroTitle')}
          </h1>
          <p className={styles.heroBody}>{t('home.heroBody')}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/products">
              {t('home.heroPrimary')}
            </Link>
            <a
              className={`${styles.secondaryAction} ${styles.heroCategoriesAction}`}
              href="#categories"
            >
              {t('home.heroSecondary')}
            </a>
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
                      sizes="(max-width: 719px) 30vw, 220px"
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
          <Link className={styles.viewAll} href="/products">
            {t('home.viewAll')}
          </Link>
        </header>
        <ul className={styles.categoryGrid}>
          {categories.map((category) => (
            <li key={category.id}>
              <Link className={styles.categoryCard} href={`/categories/${category.slug}`}>
                <span className={styles.categoryIcon}>
                  <CategoryIcon name={category.icon} width={26} height={26} />
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
       * When the catalog has no products at all, the selection, offer and
       * collection rows have nothing to draw from. Rather than repeat the same
       * "nothing to show" note three times, the gap is stated once.
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
           * The shelf owns its own section header, because the previous/next
           * controls sit in the same row as the title. There is deliberately no
           * "View all" here: the controls are the way to see more of this
           * selection, and a second link to the catalog would sit next to them
           * doing the same job less precisely.
           */}
          <FeaturedShelf products={featured} />

          {/*
           * "Recently added" (D6, Phase 26). Ordered by the stored creation timestamp, not by list
           * position, so the claim in the heading is backed by data rather than by layout.
           *
           * The section is omitted entirely when the source cannot date its products, and states a
           * shorter gap when only one or two can be dated - it never pads the row to three with a
           * repeated card or an invented entry.
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
              <ProductGrid density="trio">
                {recentlyAdded.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </ProductGrid>
            </section>
          )}

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
