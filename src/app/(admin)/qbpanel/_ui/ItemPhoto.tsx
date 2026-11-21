'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { imageVariantPath } from '@/lib/images';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './ItemPhoto.module.css';

/**
 * An order line's photograph, and the full-size view behind it.
 *
 * **Why the owner asked for it (2026-11-19).** On a confirmation call the owner recognises a product by
 * its picture rather than by its name, and the order screen used to state only the name, the vendor SKU
 * and a price. The image is the frozen `order_item.image_key_snapshot` the order recorded at placement,
 * so a line shows the picture the customer actually bought even if the catalog has changed since.
 *
 * The thumbnail is a real `<button>`: keyboard users reach the enlargement too, and the whole control is
 * one tab stop rather than a decorative image beside a separate link. Escape, the backdrop and the close
 * button all dismiss the dialog, focus moves into it on open and returns to the thumbnail on close, and
 * the page behind does not scroll while it is open.
 *
 * The bytes are the already-generated catalog variants (`src/lib/images.ts`), so no new asset path and no
 * stored URL is introduced: the key names the file and the helper derives both widths.
 *
 * A line whose snapshot is `null` - an order placed before every product had a photograph, or an import
 * that could not resolve one - draws **nothing**, and an image whose file has gone hides itself rather
 * than showing a broken-icon frame. Neither invents a picture.
 */
export function ItemPhoto({
  imageKey,
  name,
  size = 'row',
}: {
  imageKey: string | null;
  name: string;
  /** `row` is the order detail's list tile; `compact` is the same tile on a dense worklist card. */
  size?: 'row' | 'compact' | 'hero';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const compact = size === 'compact';
  const hero = size === 'hero';
  const frame = `${styles.frame} ${compact ? styles.compact : hero ? styles.hero : styles.row}`;

  /*
   * A line with no stored snapshot - or whose file has gone - keeps the frame and drops the control.
   *
   * The frame stays because `record` is a grid: an absent first child lets the name fall into the first
   * column, so one imageless line would shift every name in the list out of line with its neighbours.
   * This is the same reservation the catalog list makes with `recordPhoto`. What is *not* drawn is a
   * button: there is no picture to enlarge, so there is nothing to click and nothing to announce.
   */
  if (imageKey === null || failed) {
    return <span className={frame} aria-hidden="true" />;
  }

  const label = t('admin.order.photoOpen', { name });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-item-photo={compact ? 'compact' : hero ? 'hero' : 'row'}
        className={`${frame} ${styles.trigger}`}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <img
          className={styles.thumb}
          src={imageVariantPath(imageKey, hero ? 600 : 320)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </button>
      {open && (
        <PhotoDialog
          imageKey={imageKey}
          name={name}
          label={t('admin.order.photoDialog', { name })}
          closeLabel={t('admin.order.photoClose')}
          onClose={close}
          returnFocusTo={triggerRef}
        />
      )}
    </>
  );
}

/**
 * The photograph at its full stored size.
 *
 * Deliberately not a shared dialog primitive: the admin already has three dialogs with different jobs
 * (a confirmation, a drawer, this), and the one thing they share is a focus contract, not a shape. This
 * one is a viewer - it has no form, no destructive action and nothing to submit.
 */
function PhotoDialog({
  imageKey,
  name,
  label,
  closeLabel,
  onClose,
  returnFocusTo,
}: {
  imageKey: string;
  name: string;
  label: string;
  closeLabel: string;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    // Captured now, because the ref may have been repointed by the time the cleanup runs.
    const trigger = returnFocusTo.current;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    // Capture, so a handler inside the page cannot swallow Escape before the dialog sees it.
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
        <figure className={styles.figure}>
          <img className={styles.full} src={imageVariantPath(imageKey, 1050)} alt={name} />
        </figure>
      </div>
    </div>
  );
}
