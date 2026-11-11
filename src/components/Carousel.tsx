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
  controls = 'overlay',
  children,
}: {
  /** Names the shelf for assistive technology, e.g. "On offer". */
  label: string;
  size: 'product' | 'circle' | 'brand';
  /**
   * Where the arrows sit: floating over the row's edges (`overlay`, the default) or beside the dots
   * (`pager`). See the note on `pager` in the body.
   */
  controls?: 'overlay' | 'pager';
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

    /**
     * The slides that actually take space on screen. A caller can hide slides by its own markup, and
     * counting a hidden one would promise a page the shopper cannot reach - one dot too many. Measured,
     * like everything else here, rather than counted from the children.
     */
    const laidOutSlides = (): number => {
      const slides = [...track.children].filter((child) => child.getBoundingClientRect().width > 0);
      return Math.max(1, slides.length);
    };

    const measure = (): void => {
      const pageCount = Math.max(1, Math.ceil(laidOutSlides() / perPage()));
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

  /*
   * Where the arrows live. `overlay` floats them at the row's edges, which is right for a shelf of
   * cards - the control sits over a card's own photograph and reads as an overlay. `pager` puts them
   * either side of the dots instead, which is what a **circle rail** needs (owner direction,
   * 2026-11-12): a 40px button over a 116px circle covers the tile's own letter or logo and looks like
   * a defect rather than a control. Both are desktop affordances - the swipe is the phone's control.
   */
  const pager = controls === 'pager';

  /* One rendering of the page marks, shared by the pager row and the dots-only row. */
  const dots = () => (
    <>
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
    </>
  );

  const previousButton = (extra?: string) => (
    <button
      type="button"
      className={[styles.control, styles.flip, extra].filter(Boolean).join(' ')}
      onClick={() => scrollByPage(-1)}
      aria-label={t('home.carouselPrev')}
    >
      <ArrowIcon width={18} height={18} />
    </button>
  );

  const nextButton = (extra?: string) => (
    <button
      type="button"
      className={[styles.control, extra].filter(Boolean).join(' ')}
      onClick={() => scrollByPage(1)}
      aria-label={t('home.carouselNext')}
    >
      <ArrowIcon width={18} height={18} />
    </button>
  );

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

        {canScroll && !pager && (
          <>
            {previousButton(styles.overlayStart)}
            {nextButton(styles.overlayEnd)}
          </>
        )}
      </div>

      {pager && canScroll && slides > 1 ? (
        <div className={styles.pager}>
          {previousButton('')}
          {dots()}
          {nextButton('')}
        </div>
      ) : (
        canScroll && slides > 1 && <div className={styles.dots}>{dots()}</div>
      )}
    </div>
  );
}
