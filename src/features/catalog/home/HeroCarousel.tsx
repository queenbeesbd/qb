'use client';

import { useEffect, useRef, useState } from 'react';

import { heroImageSources } from '@/lib/images';
import { useTranslation } from '@/i18n/useTranslation';
import { ArrowIcon } from '@/components/icons';
import styles from './HeroCarousel.module.css';

export type HeroSlide = {
  readonly id: number;
  readonly imageKey: string;
  readonly altText: string;
};

/**
 * The homepage's hero carousel.
 *
 * One banner at a time, at the reference's 16:9 frame: swipe on a phone, paged arrows from 720px, and
 * dots that name the slide they go to. The order is the owner's, read from the database on the server
 * and handed here as plain data - this component never decides which banner is first.
 *
 * **It is a CSS scroll-snap track, not a JavaScript slider.** Native scrolling supplies momentum,
 * touch behaviour and the keyboard's own arrows; the buttons only call `scrollTo`, and the dots do
 * not animate by themselves. That is the same mechanism the homepage's product carousels use
 * (`src/components/Carousel.tsx`), so the shop has one shelf behaviour rather than two.
 *
 * Every image is a generated WebP/JPEG pair under `/hero`, and the description is the owner's own.
 * A banner made of baked-in type has no text a screen reader can see, which is why the description is
 * required before an image can be added at all.
 */
export function HeroCarousel({ images }: { images: readonly HeroSlide[] }) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;

    const measure = (): void => {
      const width = track.clientWidth;
      if (width === 0) return;
      setActive(Math.min(images.length - 1, Math.max(0, Math.round(track.scrollLeft / width))));
    };

    measure();
    track.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [images.length]);

  if (images.length === 0) return null;

  const goToSlide = (index: number): void => {
    const track = trackRef.current;
    if (track === null) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };

  const byPage = (direction: 1 | -1): void => {
    const next = Math.min(images.length - 1, Math.max(0, active + direction));
    goToSlide(next);
  };

  return (
    <section className={styles.hero} aria-label={t('home.heroCarouselLabel')} data-hero-carousel="">
      <div className={styles.viewport}>
        <ul
          className={styles.track}
          ref={trackRef}
          data-hero-track=""
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              byPage(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              byPage(-1);
            }
          }}
        >
          {images.map((image, index) => {
            const sources = heroImageSources(image.imageKey);
            return (
              <li className={styles.slide} key={image.id} data-hero-slide={index + 1}>
                <picture>
                  <source type="image/webp" srcSet={sources.webpSrcSet} sizes="(max-width: 1440px) 100vw, 1440px" />
                  <img
                    src={sources.fallbackSrc}
                    srcSet={sources.jpgSrcSet}
                    sizes="(max-width: 1440px) 100vw, 1440px"
                    alt={image.altText}
                    width={sources.width}
                    height={sources.height}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    {...(index === 0 ? { fetchPriority: 'high' as const } : {})}
                  />
                </picture>
              </li>
            );
          })}
        </ul>

        {images.length > 1 && (
          <div className={styles.controls}>
            <button
              type="button"
              className={`${styles.control} ${styles.previous}`}
              data-hero-arrow="previous"
              onClick={() => byPage(-1)}
              disabled={active === 0}
              aria-label={t('home.heroPrevious')}
            >
              <ArrowIcon width={18} height={18} />
            </button>
            <button
              type="button"
              className={styles.control}
              data-hero-arrow="next"
              onClick={() => byPage(1)}
              disabled={active === images.length - 1}
              aria-label={t('home.heroNext')}
            >
              <ArrowIcon width={18} height={18} />
            </button>
          </div>
        )}

        {images.length > 1 && (
          <div className={styles.dots}>
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className={styles.dot}
                data-hero-dot=""
                data-active={index === active ? 'true' : undefined}
                aria-label={t('home.heroSlideLabel', { index: index + 1, count: images.length })}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
