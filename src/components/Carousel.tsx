'use client';

import { Children, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { ArrowIcon } from './icons';
import styles from './Carousel.module.css';

/**
 * The homepage's one carousel.
 *
 * Every homepage row that holds more than one screenful uses this: the offer shelf, the category
 * circles, the brand cards and the new arrivals. One implementation means one set of controls, one
 * keyboard behaviour and one page count across the page, instead of four shelves that drift apart.
 *
 * **It is a CSS scroll-snap track, not a JavaScript slider.** The browser's own scrolling does the
 * work: momentum, accessibility and keyboard arrows come free, nothing animates on its own, and a
 * page with the buttons removed is still a working shelf. The buttons only call `scrollBy`, and the
 * dots only call `scrollTo`.
 *
 * `size` is the one thing that varies, and it is a name rather than a number so three shelves cannot
 * disagree about how wide a card is: `product` reproduces the product grid's own track exactly (two
 * columns on a phone, three from 720px, five from 1200px), `circle` and `brand` carry their own
 * scales. A caller's stylesheet therefore never re-states a slide width.
 */
export function Carousel({
  label,
  size,
  children,
}: {
  /** Names the shelf for assistive technology, e.g. "On offer". */
  label: string;
  size: 'product' | 'circle' | 'brand';
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slides, setSlides] = useState(1);
  const [canScroll, setCanScroll] = useState(false);

  /** The track's own geometry: how many pages fit, and which one is showing. */
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;

    /** The gap between slides, read from CSS so the spacing is measured rather than assumed. */
    const gap = (): number => {
      const value = Number.parseFloat(getComputedStyle(track).columnGap);
      return Number.isFinite(value) ? value : 0;
    };

    const perPage = (): number => {
      const first = track.querySelector<HTMLElement>('li');
      if (first === null || first.offsetWidth === 0) return 1;
      return Math.max(1, Math.floor((track.clientWidth + gap()) / (first.offsetWidth + gap())));
    };

    const measure = (): void => {
      const pageCount = Math.max(1, Math.ceil(Children.count(children) / perPage()));
      setSlides(pageCount);
      setCanScroll(track.scrollWidth - track.clientWidth > 4);
      setActiveSlide(
        Math.min(pageCount - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))),
      );
    };

    measure();
    track.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [children]);

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
    <div className={styles.carousel} role="group" aria-label={label}>
      <div className={styles.viewport}>
        <ul className={styles.track} data-size={size} ref={trackRef}>
          {Children.map(children, (child, index) => (
            <li key={index} className={styles.slide}>
              {child}
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
      )}
    </div>
  );
}
