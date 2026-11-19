'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { fuzzyScoreAcross } from '@/lib/fuzzy';
import { imageVariantPath } from '@/lib/images';
import styles from '../qbpanel.module.css';

/** A product the owner may attach a review to: published, not archived. */
export type ReviewProductOption = {
  id: number;
  nameEn: string;
  slug: string;
  brandNameEn: string | null;
  primaryImageKey: string | null;
};

/** How many rows the list draws. Enough to browse, short enough to scan. */
const VISIBLE_ROWS = 40;

/**
 * Choosing which product a review belongs to.
 *
 * **Why this is not a `<select>` (owner direction, 2026-11-19).** The old control was a native dropdown
 * of every published product, and the owner reported it as unusable - "choose a product is shit". The
 * reason is a mismatch of task, not of taste: this is not a *selection* from a known list, it is
 * **recognition**. The owner has a customer's message open and knows the product by what it looks like
 * and roughly what it is called. A dropdown of several hundred names asks her to read; a photograph, a
 * brand and a type-ahead ask her to recognise, which is the thing she can actually do quickly.
 *
 * So the control is a **button that opens a panel**: a search field over the same fuzzy matcher the
 * product list uses (`src/lib/fuzzy.ts`, no second definition of "matches"), one row per product
 * carrying the thumbnail, the name and the brand. Typing narrows; the first row is selected, so Enter
 * after typing a distinctive word is the whole interaction.
 *
 * **The contract it keeps**, which is the admin's existing dialog contract rather than a new one:
 * focus moves to the field on open, Tab is trapped, Escape closes, the page behind does not scroll,
 * and focus returns to the button that opened it. Arrow keys move the active row. The chosen product's
 * id is posted in a **hidden input** under the same `productId` name the form always used, so the
 * route, the validation and the no-JavaScript path are unchanged.
 */
export function ReviewProductPicker({
  products,
  value,
  open,
  onOpenChange,
  onChange,
  label,
  placeholder,
  searchLabel,
  emptyLabel,
  closeLabel,
}: {
  products: readonly ReviewProductOption[];
  value: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (id: number) => void;
  label: string;
  placeholder: string;
  searchLabel: string;
  emptyLabel: string;
  closeLabel: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = value === null ? null : (products.find((product) => product.id === value) ?? null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /*
   * Ranked by the shared matcher, ties broken by name then id so the same query always yields the same
   * list. An empty query keeps the name order the page loaded, which is the browse case.
   */
  const matches = useMemo(() => {
    const needle = query.trim();
    if (needle === '') return products.slice(0, VISIBLE_ROWS);

    const scored: { product: ReviewProductOption; score: number }[] = [];
    for (const product of products) {
      const score = fuzzyScoreAcross(needle, [product.nameEn, product.brandNameEn]);
      if (score !== null) scored.push({ product, score });
    }
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        a.product.nameEn.localeCompare(b.product.nameEn) ||
        a.product.id - b.product.id,
    );
    return scored.slice(0, VISIBLE_ROWS).map((entry) => entry.product);
  }, [products, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const trigger = triggerRef.current;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
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

    // Capture, so a handler on the page cannot swallow Escape first.
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, onOpenChange]);

  function choose(product: ReviewProductOption): void {
    onChange(product.id);
    onOpenChange(false);
    setQuery('');
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, matches.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const product = matches[active];
      if (product !== undefined) choose(product);
    }
  }

  const activeId = matches[active] === undefined ? undefined : `review-product-${matches[active].id}`;

  return (
    <>
      {/*
        The value the form posts, under the same `productId` name the form always used. It is not
        `required`: a hidden input is barred from constraint validation, so the attribute would be
        inert. The composer checks the choice and names the field in its own summary.
      */}
      <input type="hidden" name="productId" value={value === null ? '' : String(value)} />

      <button
        ref={triggerRef}
        type="button"
        className={styles.pickerTrigger}
        data-empty={selected === null}
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby="review-product-label"
        id="review-product"
      >
        {selected === null ? (
          <span className={styles.pickerTriggerText}>{placeholder}</span>
        ) : (
          <>
            <span className={styles.pickerTriggerThumb} aria-hidden="true">
              {selected.primaryImageKey !== null ? (
                <img src={imageVariantPath(selected.primaryImageKey, 320)} alt="" width={320} height={320} />
              ) : (
                <span className={styles.pickerTriggerInitial}>{selected.nameEn.slice(0, 1)}</span>
              )}
            </span>
            <span className={styles.pickerTriggerText}>
              <span className={styles.pickerTriggerName}>{selected.nameEn}</span>
              {selected.brandNameEn !== null && (
                <span className={styles.pickerTriggerBrand}>{selected.brandNameEn}</span>
              )}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className={styles.pickerBackdrop} onClick={() => onOpenChange(false)}>
          <div
            ref={dialogRef}
            className={styles.pickerDialog}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.pickerHead}>
              <input
                ref={searchRef}
                className={styles.pickerSearch}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // A new query resets the active row in the same update, so Enter always takes the
                  // best match for what was just typed. Setting it in an effect would be a second
                  // render for a value already known here.
                  setActive(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchLabel}
                aria-label={searchLabel}
                aria-controls="review-product-list"
                aria-activedescendant={activeId}
                autoComplete="off"
              />
              <button type="button" className={styles.pickerClose} onClick={() => onOpenChange(false)}>
                {closeLabel}
              </button>
            </div>

            {matches.length === 0 ? (
              <p className={styles.pickerEmpty}>{emptyLabel}</p>
            ) : (
              <ul className={styles.pickerList} id="review-product-list" role="listbox" aria-label={label}>
                {matches.map((product, index) => (
                  <li key={product.id} id={`review-product-${product.id}`} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      className={styles.pickerRow}
                      data-active={index === active}
                      onClick={() => choose(product)}
                      onMouseEnter={() => setActive(index)}
                      tabIndex={-1}
                    >
                      <span className={styles.pickerThumb} aria-hidden="true">
                        {product.primaryImageKey !== null ? (
                          <img
                            src={imageVariantPath(product.primaryImageKey, 320)}
                            alt=""
                            width={320}
                            height={320}
                            loading="lazy"
                          />
                        ) : (
                          <span className={styles.pickerInitial}>{product.nameEn.slice(0, 1)}</span>
                        )}
                      </span>
                      <span className={styles.pickerRowText}>
                        <span className={styles.pickerRowName}>{product.nameEn}</span>
                        {product.brandNameEn !== null && (
                          <span className={styles.pickerRowBrand}>{product.brandNameEn}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className={styles.pickerHint}>{t('admin.reviews.write.productHint')}</p>
          </div>
        </div>
      )}
    </>
  );
}
