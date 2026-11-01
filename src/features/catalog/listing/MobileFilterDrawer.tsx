'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/useTranslation';
import type { CatalogCategory } from '@/lib/types';
import type { CatalogFacets, CatalogQuery } from '../query';
import { FilterControls } from './FilterControls';
import styles from './listing.module.css';

type Props = {
  draft: CatalogQuery;
  facets: CatalogFacets;
  categories: readonly CatalogCategory[];
  allCount: number;
  activeCount: number;
  onDraftChange: (patch: Partial<CatalogQuery>) => void;
  /** Reset clears the draft's filters; Apply commits it. */
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
  categoryHref: (slug: string) => string;
  /** The Filters button, so focus returns there even when a tap did not focus it. */
  returnFocusTo?: RefObject<HTMLButtonElement | null>;
};

/**
 * The phone filter drawer.
 *
 * Filters are staged in a draft and committed by Apply, which is what lets a shopper choose several
 * options without a full navigation per tap. The panel is a modal dialog: focus moves into it, Tab is
 * trapped, Escape closes it, body scroll is locked, and focus returns to the Filters button on close.
 */
export function MobileFilterDrawer({
  draft,
  facets,
  categories,
  allCount,
  activeCount,
  onDraftChange,
  onReset,
  onApply,
  onClose,
  categoryHref,
  returnFocusTo,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTarget = returnFocusTo?.current ?? previouslyFocused;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // The trigger is the reliable target: a tap does not always focus a button, while a keyboard
      // activation already did. Falling back to the element that had focus keeps both paths honest.
      focusTarget?.focus();
    };
  }, [onClose, returnFocusTo]);

  return createPortal(
    <div className={styles.drawerRoot}>
      <div className={styles.drawerScrim} aria-hidden="true" onClick={onClose} />
      <div
        className={styles.drawer}
        id="mobile-filter-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-filter-title"
      >
        <header className={styles.drawerHead}>
          <div>
            <h2 id="mobile-filter-title" className={styles.drawerTitle}>
              {t('catalog.filters')}
            </h2>
            {activeCount > 0 && (
              <p className={styles.drawerMeta}>
                {t('catalog.activeFilterCount', { count: activeCount })}
              </p>
            )}
          </div>
          <button
            type="button"
            ref={closeRef}
            className={styles.drawerClose}
            aria-label={t('catalog.closeFilters')}
            onClick={onClose}
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <div className={styles.drawerBody}>
          <FilterControls
            value={draft}
            facets={facets}
            categories={categories}
            allCount={allCount}
            onFilterChange={onDraftChange}
            categoryHref={categoryHref}
            onCategoryNavigate={onClose}
            idPrefix="mobile"
          />
        </div>

        <footer className={styles.drawerFoot}>
          <button type="button" className={styles.drawerReset} onClick={onReset}>
            {t('catalog.resetFilters')}
          </button>
          <button type="button" className={styles.drawerApply} onClick={onApply}>
            {t('catalog.applyFilters')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
