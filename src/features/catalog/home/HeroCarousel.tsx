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

/** How long a banner stays before the next one takes its place. */
const AUTOPLAY_MS = 9_000;

/**
 * The homepage's hero carousel.
 *
 * One banner at a time at the 16:9 frame: swipe on a phone, arrows from 720px, and dots that name the
 * slide they go to. The order is the owner's, read from the database on the server and handed here as
 * plain data.
 *
 * **It advances by itself, and it loops** (owner direction, 2026-11-05). Every 9 seconds the next
 * banner eases in; after the last one the first returns, and the arrows do the same at either end
 * rather than disabling. The movement is a real scroll of the same snap track, so autoplay, a swipe,
 * an arrow and a dot all produce the same result and the scroll position always matches the slide
 * that is announced.
 *
 * Hover or keyboard focus pauses the timer so reading a banner does not race it, and
 * `prefers-reduced-motion` disables autoplay entirely - a banner that pages itself is motion the
 * visitor asked not to receive. Arrows and dots still work in both cases.
 *
 * The images are generated WebP/JPEG pairs under `/hero`, and every description is the owner's own.
 */
export function HeroCarousel({ images }: { images: readonly HeroSlide[] }) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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

  const goToSlide = (index: number): void => {
    const track = trackRef.current;
    if (track === null) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      if (pausedRef.current) return;
      if (document.visibilityState !== 'visible') return;
      const next = (activeRef.current + 1) % images.length;
      goToSlide(next);
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) return null;

  /** Wraps at either end: the carousel is a loop, not a filmstrip with two dead ends. */
  const byPage = (direction: 1 | -1): void => {
    goToSlide((active + direction + images.length) % images.length);
  };

  return (
    <section
      className={styles.hero}
      aria-label={t('home.heroCarouselLabel')}
      data-hero-carousel=""
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
      }}
      onFocusCapture={() => {
        pausedRef.current = true;
      }}
      onBlurCapture={() => {
        pausedRef.current = false;
      }}
    >
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
              aria-label={t('home.heroPrevious')}
            >
              <ArrowIcon width={18} height={18} />
            </button>
            <button
              type="button"
              className={styles.control}
              data-hero-arrow="next"
              onClick={() => byPage(1)}
              aria-label={t('home.heroNext')}
            >
              <ArrowIcon width={18} height={18} />
            </button>
          </div>
        )}

        {images.length > 1 && (
          <div className={styles.bottomBar}>
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
          </div>
        )}
      </div>
    </section>
  );
}
