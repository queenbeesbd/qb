'use client';

import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogImage } from '@/lib/types';
import { ProductPhoto } from '@/components/ProductPhoto';
import { DETAIL_SIZES } from '@/lib/images';
import styles from './GalleryCarousel.module.css';

/**
 * The product photograph gallery on a phone: one full-width snap carousel.
 *
 * **Why a carousel on the phone and a thumb rail on desktop.** A phone has no room for a strip of
 * thumbnails beside a photograph; swiping photographs is the native pattern for it. The desktop
 * keeps the clicked-thumbnail composition (`ProductDetailView`); this component is the <880px
 * presentation of the same `product.images` data, and the two are never rendered together —
 * the two-composition rule this redesign follows everywhere the viewports diverge.
 *
 * Behaviour:
 * - Native horizontal scroll with `scroll-snap`, edge to edge (the store's rail pattern).
 * - Dot indicators reflect the scrolled-to photograph via a scroll listener — never a timer —
 *   and each dot is a real button that scrolls the strip to its photograph, so the dots are
 *   keyboard operable too.
 * - The scroll listener is passive and reads no layout except the strip's own offsets; no
 *   `setState` during render.
 */
export function GalleryCarousel({ images, name }: { images: readonly CatalogImage[]; name: string }) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onScroll = () => {
      const index = Math.round(strip.scrollLeft / Math.max(strip.clientWidth, 1));
      setActive(Math.max(0, Math.min(images.length - 1, index)));
    };
    strip.addEventListener('scroll', onScroll, { passive: true });
    return () => strip.removeEventListener('scroll', onScroll);
  }, [images.length]);

  const scrollTo = (index: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollTo({ left: index * strip.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.strip} ref={stripRef} data-gallery-carousel>
        {images.map((image, index) => (
          <figure key={image.key} className={styles.frame}>
            <ProductPhoto
              image={image}
              alt={index === 0 ? name : ''}
              sizes={DETAIL_SIZES}
              priority={index === 0}
              fallbackLabel={t('product.imagePlaceholder')}
            />
          </figure>
        ))}
      </div>
      {images.length > 1 && (
        <div className={styles.dots} role="tablist" aria-label={t('product.galleryDotsLabel')}>
          {images.map((image, index) => (
            <button
              key={image.key}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={t('product.galleryGoTo', { index: index + 1 })}
              className={index === active ? `${styles.dot} ${styles.dotActive}` : styles.dot}
              onClick={() => scrollTo(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
