'use client';

import { useEffect, useRef } from 'react';
import { CloseIcon, SearchIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './listing.module.css';

/**
 * The listing's own search field.
 *
 * **Search as you type.** Typing is debounced by a third of a second and then narrows the listing
 * without pressing anything: the icon is a submit button for the no-JavaScript form and for Enter, not
 * the only way in. The debounce is what keeps a server-rendered listing responsive without one request
 * per keystroke, and the submitted term replaces the URL rather than pushing, so a search does not fill
 * the back button with half-typed words.
 *
 * It stays uncontrolled on purpose: the committed term lives in the URL and the input mirrors it. That
 * keeps the caret in place while the server renders a new result set - a controlled field re-keyed on
 * every navigation would drop focus mid-search - and the effect below only writes the DOM value when
 * the committed term changes from outside (a filter reset or back/forward), never React state.
 */
export function ProductSearch({
  initial,
  onSubmit,
  onLiveSubmit,
}: {
  initial: string;
  onSubmit: (term: string) => void;
  /** Called with the debounced term. Omitted where a live search would be pointless or harmful. */
  onLiveSubmit?: (term: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);
  /** The term the URL already carries, so the debounce never re-navigates to the page it is on. */
  const committedRef = useRef(initial);

  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== initial) input.value = initial;
    committedRef.current = initial;
  }, [initial]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function submit(term: string) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = term.trim().slice(0, 80);
    committedRef.current = next;
    onSubmit(next);
  }

  function schedule(value: string) {
    if (!onLiveSubmit) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const next = value.trim().slice(0, 80);
      if (next === committedRef.current) return;
      committedRef.current = next;
      onLiveSubmit(next);
    }, 300);
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
          onChange={(event) => schedule(event.currentTarget.value)}
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
