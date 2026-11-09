'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CloseIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/useTranslation';
import { IMAGE_WIDTHS, heroImageSources, imageVariantPath } from '@/lib/images';
import styles from './OfferPopup.module.css';

export type OfferPopupImage = {
  readonly imageKey: string;
  readonly aspect: 'square' | 'wide';
  /** The owner's description, or null when they wrote none (optional since 2026-11-10). */
  readonly altText: string | null;
  /** Changes when the owner saves a new popup, so a new offer opens again in the same session. */
  readonly campaign: string;
};

/**
 * The site-open offer popup.
 *
 * It opens on the first storefront page of a browsing **session** and then stays closed for that
 * session: a promotion that reopened on every navigation would fight the shop. The campaign token is
 * the saved row's image key plus its update time, so replacing the offer shows the new one even in a
 * session that already dismissed the old.
 *
 * It is a real modal: `role="dialog" aria-modal`, a labelled close button, Escape to close, a click on
 * the backdrop, a locked page, focus moved to Close and returned to the previous element. The image is
 * the whole content - the owner supplies its accessible description, and the storefront invents no
 * copy or link.
 */
export function OfferPopup({ imageKey, aspect, altText, campaign }: OfferPopupImage) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = window.sessionStorage.getItem('qb_offer_popup_seen');
    } catch {
      // A browser with storage disabled shows the offer; it is not a security boundary.
    }
    if (seen === campaign) return;

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    /*
     * Open on the next frame rather than synchronously inside the effect: the rule against setState in
     * an effect exists to prevent a render loop, and deferring also lets the page finish its first paint
     * behind the overlay.
     *
     * The "seen" token is written **inside** that callback, not before it. React runs effects twice in
     * development StrictMode: writing the token first made the second pass believe the offer had been
     * dismissed and cancel the only scheduled open.
     */
    const frame = window.requestAnimationFrame(() => {
      setOpen(true);
      try {
        window.sessionStorage.setItem('qb_offer_popup_seen', campaign);
      } catch {
        // Same as above: the popup still works without session storage.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [campaign]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      // The dialog has one interactive control; keep Tab there rather than letting focus escape behind
      // the overlay.
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, close]);

  if (!open) return null;

  const sources =
    aspect === 'wide'
      ? heroImageSources(imageKey)
      : {
          webpSrcSet: IMAGE_WIDTHS.map(
            (width) => `${imageVariantPath(imageKey, width)} ${width}w`,
          ).join(', '),
          fallbackSrc: imageVariantPath(imageKey),
          width: 600,
          height: 600,
        };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.dialog} data-aspect={aspect}>
        {/*
          The owner's description names the dialog when there is one. Without it the dialog still needs
          an accessible name, and a plain "Offer" says what the surface is without describing a picture
          nobody described.
        */}
        <div className={styles.card} role="dialog" aria-modal="true" aria-label={altText ?? t('popup.label')}>
          <img
            className={styles.image}
            src={sources.fallbackSrc}
            srcSet={sources.webpSrcSet}
            sizes={aspect === 'wide' ? '(max-width: 820px) 94vw, 760px' : '(max-width: 560px) 92vw, 520px'}
            width={sources.width}
            height={sources.height}
            alt=""
            decoding="async"
          />
        </div>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={close}
          aria-label={t('popup.close')}
        >
          <CloseIcon width={22} height={22} />
        </button>
      </div>
    </div>
  );
}
