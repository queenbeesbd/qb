'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import { normaliseForSearch } from '@/lib/format';
import {
  MIN_SUGGESTION_LETTERS,
  type SearchSuggestion,
  type SearchSuggestions,
} from '@/lib/search-suggestions';
import { ProductPhoto } from './ProductPhoto';
import { SearchIcon } from './icons';
import styles from './Header.module.css';

/** A pause, not every keystroke: one request per word the customer stops on. */
const DEBOUNCE_MS = 300;

/**
 * One storefront search field, with the owner's suggestion popup (owner direction, 2026-11-14).
 *
 * **Typing opens matches; it no longer navigates.** Until 2026-11-14 a 400ms pause pushed the customer
 * onto `/products?q=` mid-word. The owner asked for the reference's behaviour instead (ADR 0041): the
 * field grows a short list of products - photograph, name, brand and pack, price with any genuine saving
 * struck through, and a stock state when it is not in stock - and the listing is entered deliberately, by
 * Enter, by the magnifier, or by the "See all results" row at the foot of the list.
 *
 * The form is still a plain `GET` to `/products`, so Enter and a browser without JavaScript both reach a
 * real search page. The list is an enhancement over that, never the only way in.
 *
 * It is a real combobox: the field owns the keyboard (Arrow keys move the highlighted row, Enter opens
 * it, Escape closes the list), `aria-activedescendant` keeps the browser's focus in the field, and the
 * list names itself. A row is a link, so a pointer and a middle-click behave as links do.
 */
export function HeaderSearch({ id, variant }: { id: string; variant: 'inline' | 'row' }) {
  const { t, price } = useTranslation();
  const router = useRouter();

  const [term, setTerm] = useState('');
  /**
   * `null` means "no answer for the current term": nothing has been asked for, or the last request
   * failed. An empty array is a real answer - the shop has no match - and is said in words.
   */
  const [results, setResults] = useState<readonly SearchSuggestion[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const formRef = useRef<HTMLFormElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = `${id}-suggestions`;

  /*
   * One trailing debounce per field. A shorter term closes the list in the change handler rather than
   * here, so this effect never sets state synchronously; the fetch itself is aborted when the term moves
   * on, which is what keeps an out-of-order answer from replacing a newer one.
   */
  useEffect(() => {
    const query = term.trim();
    if (normaliseForSearch(query).length < MIN_SUGGESTION_LETTERS) return;

    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`search answered ${response.status}`);
          const body = (await response.json()) as SearchSuggestions;
          // The answer must be for the term on screen; a slower earlier request has been aborted, and
          // this is the second guard for a response that arrived anyway.
          if (body.query !== query) return;
          setResults(body.results);
          setActive(-1);
          setOpen(true);
        } catch {
          // A refused or aborted request closes the list and leaves the form working: Enter still
          // submits a real search, and no error the customer cannot act on is printed.
          if (controller.signal.aborted) return;
          setResults(null);
          setOpen(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [term]);

  // Abort on unmount so a navigation does not leave a request writing into a gone component.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  /* A click anywhere else - a product tile, a tab, the cart - closes the list. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && formRef.current?.contains(event.target) === true) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function change(value: string): void {
    setTerm(value);
    setActive(-1);
    if (normaliseForSearch(value.trim()).length < MIN_SUGGESTION_LETTERS) {
      abortRef.current?.abort();
      setResults(null);
      setOpen(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      if (!open || results === null || results.length === 0) return;
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!open || results === null || results.length === 0) return;
      event.preventDefault();
      setActive((index) => Math.max(index - 1, -1));
      return;
    }
    if (event.key === 'Enter') {
      const highlighted = results?.[active];
      if (!open || highlighted === undefined) return; // no row chosen: the form submits as a search
      event.preventDefault();
      setOpen(false);
      router.push(`/products/${highlighted.slug}`);
    }
  }

  const trimmed = term.trim();
  const showList = open && results !== null;

  return (
    <form
      ref={formRef}
      className={variant === 'inline' ? styles.search : styles.mobileSearch}
      role="search"
      action="/products"
      method="get"
    >
      <label className="sr-only" htmlFor={id}>
        {t('search.label')}
      </label>
      <input
        id={id}
        type="search"
        name="q"
        placeholder={t('search.placeholder')}
        autoComplete="off"
        maxLength={80}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && active >= 0 ? `${id}-option-${active}` : undefined
        }
        value={term}
        onChange={(event) => change(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" aria-label={t('search.submit')}>
        <SearchIcon width={18} height={18} />
      </button>

      {showList && (
        <div
          id={listId}
          className={styles.suggest}
          role="listbox"
          aria-label={t('search.suggestions')}
        >
          {results.length === 0 ? (
            <p className={styles.suggestEmpty}>{t('search.noResultsTitle')}</p>
          ) : (
            results.map((row, index) => (
              <Link
                key={row.id}
                id={`${id}-option-${index}`}
                href={`/products/${row.slug}`}
                role="option"
                aria-selected={index === active}
                className={styles.suggestRow}
                data-active={index === active ? 'true' : undefined}
                onClick={() => setOpen(false)}
              >
                <ProductPhoto
                  image={row.image ?? undefined}
                  alt=""
                  sizes="48px"
                  frame="1 / 1"
                  className={styles.suggestPhoto}
                />
                <span className={styles.suggestBody}>
                  <span className={styles.suggestName}>{row.name}</span>
                  {(row.brand !== null || row.pack !== null) && (
                    <span className={styles.suggestMeta}>
                      {[row.brand, row.pack].filter((part) => part !== null).join(' · ')}
                    </span>
                  )}
                  <span className={styles.suggestPrice}>
                    {price(row.priceMinor)}
                    {row.compareAtPriceMinor !== null && (
                      <>
                        {' '}
                        {/* The same accessible prefix a product page uses, so a struck price is never
                            read out as a second current price. */}
                        <s className={styles.suggestCompare}>
                          <span className="sr-only">{t('product.wasPrice')}: </span>
                          {price(row.compareAtPriceMinor)}
                        </s>
                      </>
                    )}
                  </span>
                  {row.availability !== 'in_stock' && (
                    <span className={styles.suggestState}>
                      {t(
                        row.availability === 'unknown'
                          ? 'product.availability.unknown'
                          : 'product.availability.out_of_stock',
                      )}
                    </span>
                  )}
                </span>
              </Link>
            ))
          )}
          <Link
            href={`/products?q=${encodeURIComponent(trimmed)}`}
            className={styles.suggestAll}
            onClick={() => setOpen(false)}
          >
            {t('search.seeAll', { query: trimmed })}
          </Link>
        </div>
      )}
    </form>
  );
}
