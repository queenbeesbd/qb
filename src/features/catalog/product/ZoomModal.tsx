'use client';

import { useEffect, useCallback } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogImage } from '@/lib/types';
import { ProductPhoto } from '@/components/ProductPhoto';
import styles from './ZoomModal.module.css';

/**
 * The product photograph at its full stored ratio.
 *
 * **Why a modal rather than a bigger frame.** The product page's frame is cropped square so the price
 * and the actions sit beside the photograph instead of below it — the rebalance this redesign makes.
 * The crop is presentation only: the stored photography is 3:4, and a customer judging a bottle's
 * shape deserves the uncropped original. The modal is where that is shown, on demand, without
 * compromising the page layout.
 *
 * Behaviour contract:
 * - Opens on click/Enter/Space from the main image button (a real `<button>`, keyboard operable).
 * - Escape closes and returns focus to the trigger; the backdrop click closes.
 * - `role="dialog"`, `aria-modal`, labelled by the product name.
 * - Scroll is locked while open; the page behind does not move.
 * - No animation of its own beyond the page's standard transitions, so
 *   `prefers-reduced-motion` needs no special case.
 */
export function ZoomModal({
  image,
  name,
  onClose,
}: {
  image: CatalogImage | undefined;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onKeyDown]);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t('product.zoomLabel', { name })}
      onClick={onClose}
    >
      <div className={styles.frame} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('product.zoomClose')} autoFocus>
          ×
        </button>
        <figure className={styles.figure}>
          {/*
            No `frame` prop: the photograph renders at its own stored ratio, and `uncropped` is what
            says so - the same rule the page follows (2026-11-12), which is why this is now a
            confirm-the-whole-image surface rather than the only one that showed it uncropped.
          */}
          <ProductPhoto image={image} alt={name} sizes="90vw" priority uncropped fallbackLabel={t('product.imagePlaceholder')} />
        </figure>
        <p className={styles.hint}>{t('product.zoomHint')}</p>
      </div>
    </div>
  );
}
