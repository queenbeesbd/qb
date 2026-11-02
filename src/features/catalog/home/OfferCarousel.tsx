'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { CARD_FRAME, SHELF_CARD_SIZES } from '@/lib/images';
import type { CatalogItem } from '@/lib/types';
import { ArrowIcon } from '@/components/icons';
import { ProductCard } from '@/components/ProductCard';
import styles from './OfferCarousel.module.css';

/**
 * The offer shelf: the shop's discounted products, swipeable on a phone and paged on a desktop.
 *
 * **Why a carousel here and nowhere else.** The featured row is the owner's complete selection, so it
 * has nothing off screen and no controls. Offers are different: the shop can hold more discounts than
 * one row, and a shopper who is price-led wants to keep going. So this row scrolls, and it says so -
 * a "next" control, a progress bar and a slide count, all of which are hidden on a phone where the
 * swipe itself is the affordance and every one of those controls would cover a card.
 *
 * **It is a CSS scroll-snap track, not a JS slider.** The browser's own scrolling does the work: it
 * is the fastest thing on a phone, it keeps momentum and accessibility for free, keyboard arrow keys
 * move it, and `prefers-reduced-motion` needs nothing special because nothing animates on its own.
 * The buttons only call `scrollBy`, so a page with the buttons removed is still a working shelf.
 *
 * The dots are buttons rather than decoration, so a customer can jump to a slide without swiping
 * through the ones before it, and `aria-current` states which one is on screen.
 */
export function OfferCarousel({ products }: { products: readonly CatalogItem[] }) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slides, setSlides] = useState(1);
  const [canScroll, setCanScroll] = useState(false);

  /** The track's own geometry: how many pages fit, and which one is showing. */
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;

    const pagesIn = (): number => {
      const first = track.querySelector<HTMLElement>('li');
      if (first === null || first.offsetWidth === 0) return 1;
      return Math.max(1, Math.floor((track.clientWidth + 12) / (first.offsetWidth + 12)));
    };

    const measure = (): void => {
      const perPage = pagesIn();
      const pageCount = Math.max(1, Math.ceil(products.length / perPage));
      setSlides(pageCount);
      setCanScroll(track.scrollWidth - track.clientWidth > 4);
      setActiveSlide(Math.min(pageCount - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
    };

    measure();
    track.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [products.length]);

  const scrollByPage = (direction: 1 | -1): void => {
    const track = trackRef.current;
    if (track === null) return;
    track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
  };

  const goToSlide = (index: number): void => {
    const track = trackRef.current;
    if (track === null) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={styles.carousel} role="group" aria-label={t('home.carouselLabel')}>
      <div className={styles.viewport}>
        <ul className={styles.track} ref={trackRef} data-offer-track>
          {products.map((product) => (
            <li className={styles.slide} key={product.id}>
              {/*
                The homepage card frame (5:4), not the listing's taller 4:5: this is a shelf read
                across, and the taller crop left a gap between the title and the price in every card.
              */}
              <ProductCard product={product} frame={CARD_FRAME} sizes={SHELF_CARD_SIZES} />
            </li>
          ))}
        </ul>

        {canScroll && (
          <>
            <button
              type="button"
              className={`${styles.control} ${styles.previous}`}
              onClick={() => scrollByPage(-1)}
              aria-label={t('home.carouselPrev')}
            >
              <ArrowIcon width={18} height={18} />
            </button>
            <button
              type="button"
              className={`${styles.control} ${styles.next}`}
              onClick={() => scrollByPage(1)}
              aria-label={t('home.carouselNext')}
            >
              <ArrowIcon width={18} height={18} />
            </button>
          </>
        )}
      </div>

      {canScroll && slides > 1 && (
        <div className={styles.footer}>
          <div className={styles.dots}>
            {Array.from({ length: slides }, (_, index) => (
              <button
                key={index}
                type="button"
                className={styles.dot}
                data-active={index === activeSlide ? 'true' : undefined}
                aria-label={t('home.slideLabel', { index: index + 1, count: slides })}
                aria-current={index === activeSlide ? 'true' : undefined}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
          <Link className={styles.allOffers} href="/products?sort=price-asc">
            {t('home.dealsViewAll')}
            <ArrowIcon width={14} height={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
