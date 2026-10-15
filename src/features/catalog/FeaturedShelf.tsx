'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogItem } from '@/lib/types';
import { ProductCard } from '@/components/ProductCard';
import { ChevronIcon, InfoIcon } from '@/components/icons';
import homeStyles from '@/app/home.module.css';
import styles from './FeaturedShelf.module.css';

/**
 * Horizontally navigable featured shelf, including the section header it lives
 * in.
 *
 * The header owns the previous/next controls so they sit where the section's
 * "View all" link used to be: one row, one place to look for "see more of this
 * selection". The controls are only rendered when the row can actually scroll,
 * so they never imply movement that will not happen.
 *
 * There are no cloned cards, no autoplay and no carousel dependency - the
 * browser's own overflow scrolling does the work, and the card count is bounded
 * by the selection cap in `src/data/curation.ts`.
 */
export function FeaturedShelf({ products }: { products: readonly CatalogItem[] }) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  /**
   * Reads the scroll position. Only ever called from async callbacks (scroll
   * events and ResizeObserver), never synchronously inside an effect body.
   */
  const syncControls = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const maxScroll = element.scrollWidth - element.clientWidth;
    // Sub-pixel scroll positions mean a small tolerance is required.
    setCanScrollBack(element.scrollLeft > 1);
    setCanScrollForward(element.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    element.addEventListener('scroll', syncControls, { passive: true });
    // ResizeObserver fires asynchronously on observe, which also covers the
    // initial measurement and any breakpoint change.
    const observer = new ResizeObserver(syncControls);
    observer.observe(element);

    return () => {
      element.removeEventListener('scroll', syncControls);
      observer.disconnect();
    };
  }, [syncControls]);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const element = scrollerRef.current;
    if (!element) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({
      // One page equals one viewport of columns, so the shelf advances evenly.
      left: element.clientWidth * direction,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, []);

  const showControls = products.length > 0 && (canScrollBack || canScrollForward);

  return (
    <section className={homeStyles.section} aria-labelledby="featured-title">
      <header className={homeStyles.sectionHeader}>
        <div>
          <h2 id="featured-title">{t('home.featuredTitle')}</h2>
          <p className={homeStyles.sectionBody}>{t('home.featuredBody')}</p>
        </div>
        {showControls && (
          <div className={styles.controls} role="group" aria-label={t('home.shelfControls')}>
            <button
              type="button"
              className={styles.control}
              onClick={() => scrollByPage(-1)}
              disabled={!canScrollBack}
              aria-label={t('home.shelfPrevious')}
            >
              <ChevronIcon className={styles.iconBack} width={18} height={18} />
            </button>
            <button
              type="button"
              className={styles.control}
              onClick={() => scrollByPage(1)}
              disabled={!canScrollForward}
              aria-label={t('home.shelfNext')}
            >
              <ChevronIcon width={18} height={18} />
            </button>
          </div>
        )}
      </header>

      {products.length > 0 ? (
        <div
          className={styles.scroller}
          ref={scrollerRef}
          tabIndex={0}
          role="group"
          aria-label={t('home.shelfLabel')}
        >
          {products.map((product) => (
            <div className={styles.slot} key={product.id}>
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      ) : (
        <div className={homeStyles.emptyNote}>
          <InfoIcon width={22} height={22} />
          <div>
            <p className={homeStyles.emptyTitle}>{t('home.selectionEmptyTitle')}</p>
            <p className={homeStyles.emptyBody}>{t('home.selectionEmptyBody')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
