'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { ProductPhoto } from '@/components/ProductPhoto';
import { useTranslation } from '@/i18n/useTranslation';
import { CARD_FRAME } from '@/lib/images';
import type { CatalogCategory, CatalogItem } from '@/lib/types';
import styles from './not-found.module.css';

/**
 * The 404, built as the shop rather than as an apology (direction: the specimen catalogue).
 *
 * The idea: **the shop's own shelf becomes the answer.** A wrong address is a reader who wanted
 * something; instead of a sentence about a missing page, the page sets what the shop actually sells out
 * in front of them - seven specimen tiles in the hero, the same products again as a menu with their
 * real price and pack size, then the category index. Everything on it is a stored fact
 * (`loadNotFoundShelf`): no invented reviews, arrivals, counts or "popular" claims.
 *
 * The one live thing: the search field, which is the fastest way out of a wrong address for someone
 * who knows what they came for.
 *
 * Motion: an entrance per group (heading, then text, then pictures), revealed once as it enters, and a
 * press/hover answer on every card. Nothing is hidden when the script does not run - the reveal only
 * ever starts from `data-reveal="pending"`, which JavaScript itself sets.
 */
export function NotFoundView({
  products,
  categories,
  unavailable,
  inStockTotal,
  standalone,
}: {
  products: readonly CatalogItem[];
  categories: readonly CatalogCategory[];
  unavailable: boolean;
  inStockTotal: number;
  /**
   * True on the root 404, which renders outside the storefront layout and therefore has no header:
   * the page draws its own mark. Inside the storefront the real header is already above it, so the
   * mark is omitted rather than drawn twice.
   */
  standalone: boolean;
}) {
  const { t, price } = useTranslation();
  const root = useRef<HTMLDivElement>(null);

  // The entrance. One observer for the whole page, groups staggered by their index.
  useEffect(() => {
    const container = root.current;
    if (container === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const groups = [...container.querySelectorAll<HTMLElement>('[data-reveal-group]')];
    for (const group of groups) {
      const items = [...group.querySelectorAll<HTMLElement>('[data-reveal-item]')];
      for (const item of items) item.dataset.reveal = 'pending';
    }

    /*
     * Anything already in the first screen is shown immediately: a heading that is waiting for an
     * observer callback is a heading that is missing for a moment, and on a fast scroll that moment is
     * the only one the reader sees.
     */
    for (const group of groups) {
      const box = group.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.9) {
        for (const item of group.querySelectorAll<HTMLElement>('[data-reveal-item]')) {
          item.dataset.reveal = 'shown';
        }
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const group = entry.target as HTMLElement;
          const items = [...group.querySelectorAll<HTMLElement>('[data-reveal-item]')];
          items.forEach((item, index) => {
            item.style.transitionDelay = `${Math.min(index, 8) * 70}ms`;
            item.dataset.reveal = 'shown';
          });
          observer.unobserve(group);
        }
      },
      { rootMargin: '240px 0px 120px 0px', threshold: 0 },
    );

    for (const group of groups) observer.observe(group);
    return () => observer.disconnect();
  }, []);

  // Six tiles: one wide and five single, which is a mosaic rather than a strip and keeps the hero from
  // outgrowing its text column.
  const tiles = products.slice(0, 6);
  const shelf = products;
  const shopCategories = categories.slice(0, 8);

  return (
    <div className={styles.page} data-standalone={standalone ? 'true' : 'false'} ref={root}>
      <section className={styles.hero} aria-labelledby="not-found-title">
        <div className={styles.heroText} data-reveal-group>
          <h1 id="not-found-title" className={styles.title} data-reveal-item>
            {t('notFound.headline')}
          </h1>
          <p className={styles.lede} data-reveal-item>
            {t('notFound.lede')}
          </p>
          <form className={styles.search} action="/products" method="get" role="search" data-reveal-item>
            <label className="sr-only" htmlFor="not-found-search">
              {t('notFound.searchLabel')}
            </label>
            <input
              id="not-found-search"
              className={styles.searchInput}
              type="search"
              name="q"
              placeholder={t('notFound.searchPlaceholder')}
              autoComplete="off"
            />
            <button className={styles.searchButton} type="submit">
              {t('notFound.searchAction')}
            </button>
          </form>
          {/*
            The shop's name is folded into this sentence rather than set above the headline: a wordmark
            standing on its own above an h1 reads as a kicker, and the facts here are real counts.
          */}
          <p className={styles.heroFacts} data-reveal-item>
            {t('notFound.heroFacts', {
              products: inStockTotal,
              categories: categories.length,
            })}
          </p>
          {shopCategories.length > 0 && (
            <div className={styles.heroCategories} data-reveal-item>
              <h2 className={styles.heroCategoriesTitle}>{t('notFound.categoriesTitle')}</h2>
              <ul className={styles.categoryRow}>
                {shopCategories.map((category) => (
                  <li key={category.id}>
                    <Link className={styles.categoryLink} href={`/categories/${category.slug}`}>
                      {category.name.en ?? category.name.bn}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.heroShelf} aria-hidden={tiles.length === 0 ? true : undefined}>
          <ul className={styles.mosaic} data-reveal-group>
            {tiles.map((product, index) => (
              <li
                key={product.id}
                className={`${styles.tile} ${index === 0 ? styles.tileWide : ''}`}
                data-reveal-item
              >
                <ProductPhoto
                  image={product.images[0]}
                  alt=""
                  sizes="(max-width: 719px) 40vw, 18vw"
                  frame={CARD_FRAME}
                  fallbackLabel={product.name.en ?? ''}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {unavailable ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('notFound.shelfUnavailableTitle')}</h2>
          <p className={styles.sectionNote}>{t('notFound.shelfUnavailableBody')}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/products">
              {t('notFound.allProducts')}
            </Link>
            <Link className={styles.secondaryAction} href="/categories">
              {t('notFound.categoriesAction')}
            </Link>
          </div>
        </section>
      ) : (
        shelf.length > 0 && (
          <section className={styles.section} aria-labelledby="not-found-shelf">
            <div className={styles.sectionHead} data-reveal-group>
              <h2 id="not-found-shelf" className={styles.sectionTitle} data-reveal-item>
                {t('notFound.shelfTitle')}
              </h2>
              <span className={styles.sectionCount} data-reveal-item>
                {t('notFound.shelfCount', { count: shelf.length })}
              </span>
            </div>

            {/*
              The catalogue as a menu: a 64px photograph where a bullet would be, the name and the price
              on one line, then the one fact the shop really stores about the item.
            */}
            <ul className={styles.shelfList} data-reveal-group>
              {shelf.map((product) => (
                <li key={product.id} className={styles.shelfItem} data-reveal-item>
                  <Link className={styles.shelfLink} href={`/products/${product.slug}`}>
                    <span className={styles.shelfPhoto}>
                      <ProductPhoto
                        image={product.images[0]}
                        alt=""
                        sizes="64px"
                        frame="1 / 1"
                        fallbackLabel={product.name.en ?? ''}
                      />
                    </span>
                    <span className={styles.shelfBody}>
                      <span className={styles.shelfLine}>
                        <span className={styles.shelfName}>{product.name.en ?? product.name.bn}</span>
                        <span className={styles.shelfPrice}>{price(product.priceMinor)}</span>
                      </span>
                      <span className={styles.shelfFact}>
                        {product.pack !== null && product.pack !== ''
                          ? product.pack
                          : product.brand ?? t('notFound.inStock')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      {/* The reply card, and nothing beside it: one printed card on a coloured field. */}
      <section className={styles.cta} aria-labelledby="not-found-cta">
        <div className={styles.ctaCard}>
          <h2 id="not-found-cta" className={styles.ctaTitle}>
            {t('notFound.ctaTitle')}
          </h2>
          <p className={styles.ctaBody}>{t('notFound.ctaBody')}</p>
          <Link className={styles.ctaAction} href="/products">
            {t('notFound.allProducts')}
          </Link>
          <p className={styles.ctaNote}>{t('notFound.ctaNote')}</p>
        </div>
      </section>
    </div>
  );
}
