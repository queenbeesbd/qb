'use client';

import { useEffect, useRef } from 'react';
import { CloseIcon, SearchIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './listing.module.css';

/**
 * The listing's own search field.
 *
 * It is uncontrolled on purpose: the committed term lives in the URL, and the input mirrors it. That
 * keeps the caret in place while the server renders a new result set - a controlled field re-keyed on
 * every navigation would drop focus mid-search - and the one effect below only writes the DOM value when
 * the committed term changes (a filter reset or back/forward), never React state.
 *
 * Enter submits; there is no speculative request while the shopper is still typing. A server-rendered
 * listing does not need a debounce to be responsive, and a half-typed word would otherwise overwrite the
 * URL and the back history.
 */
export function ProductSearch({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (term: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== initial) input.value = initial;
  }, [initial]);

  // The header's compact search at 1024-1199px links here with #catalog-search; following it should put
  // the caret in the field rather than leave the shopper to find it. Honoured once on arrival.
  useEffect(() => {
    if (window.location.hash === '#catalog-search') inputRef.current?.focus();
  }, []);

  function submit(term: string) {
    onSubmit(term.trim().slice(0, 80));
  }

  return (
    <form
      className={styles.searchForm}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit(inputRef.current?.value ?? '');
      }}
    >
      <div className={styles.searchField}>
        <button type="submit" className={styles.searchSubmit} aria-label={t('search.submit')}>
          <SearchIcon width={17} height={17} />
        </button>
        <input
          id="catalog-search"
          ref={inputRef}
          type="search"
          defaultValue={initial}
          placeholder={t('catalog.searchPlaceholder')}
          aria-label={t('search.label')}
          autoComplete="off"
          maxLength={80}
        />
        <button
          type="button"
          className={styles.searchClear}
          aria-label={t('search.clear')}
          onClick={() => {
            const input = inputRef.current;
            if (input) {
              input.value = '';
              input.focus();
            }
            submit('');
          }}
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>
    </form>
  );
}
