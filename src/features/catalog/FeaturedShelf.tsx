'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { Product } from '@/lib/types';
import { ProductCard } from '@/components/ProductCard';
import { ChevronIcon } from '@/components/icons';
import styles from './FeaturedShelf.module.css';

/**
 * Horizontally navigable product shelf.
 *
 * Products flow column-wise into two rows and the container scrolls sideways, so
 * both rows always advance together as one coordinated group. There are no
 * cloned cards, no infinite loop, no autoplay and no carousel dependency - the
 * browser's own overflow scrolling does the work.
 *
 * Controls are hidden entirely when there is nowhere to navigate, so they can
 * never imply movement that will not happen.
 */
export function FeaturedShelf({ products }: { products: readonly Product[] }) {
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
      // One page equals one viewport of columns, so the group advances evenly.
      left: element.clientWidth * direction,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, []);

  const showControls = canScrollBack || canScrollForward;

  return (
    <div className={styles.wrap}>
      {showControls && (
        <div className={styles.controls}>
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
    </div>
  );
}
