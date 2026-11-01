'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './listing.module.css';

type Props = {
  /** Catalog-wide bounds for this page's category, in poisha. */
  bounds: { min: number; max: number };
  minPrice: number | null;
  maxPrice: number | null;
  onCommit: (minPrice: number | null, maxPrice: number | null) => void;
  idPrefix: string;
};

/**
 * Price range with two number inputs and a two-thumb slider.
 *
 * Values are whole taka in the interface and integer poisha in the filter: the URL carries taka, and a
 * product at 120.50 Tk is still included by a 120 Tk minimum because the stored comparison stays in
 * poisha. Nothing here accepts a formatted amount or a decimal - the same rule the owner's price editor
 * follows - so a pasted "Tk 1,200" is a refused field, not a guessed price.
 */
export function PriceRangeFilter({ bounds, minPrice, maxPrice, onCommit, idPrefix }: Props) {
  const { t, price } = useTranslation();
  const floor = Math.floor(bounds.min / 100);
  const ceiling = Math.ceil(bounds.max / 100);
  const span = Math.max(1, ceiling - floor);

  const [low, setLow] = useState(minPrice !== null ? Math.round(minPrice / 100) : floor);
  const [high, setHigh] = useState(maxPrice !== null ? Math.round(maxPrice / 100) : ceiling);
  const [minText, setMinText] = useState(minPrice !== null ? String(Math.round(minPrice / 100)) : '');
  const [maxText, setMaxText] = useState(maxPrice !== null ? String(Math.round(maxPrice / 100)) : '');
  const [error, setError] = useState<string | null>(null);

  const fromPercent = ((Math.min(low, high) - floor) / span) * 100;
  const toPercent = ((Math.max(low, high) - floor) / span) * 100;

  function commit(nextLow: number, nextHigh: number) {
    onCommit(
      nextLow <= floor ? null : nextLow * 100,
      nextHigh >= ceiling ? null : nextHigh * 100,
    );
  }

  function readBound(text: string, fallback: number): number | null {
    const value = text.trim();
    if (value === '') return fallback;
    if (!/^\d{1,7}$/.test(value)) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(Math.max(parsed, floor), ceiling);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextLow = readBound(minText, floor);
    const nextHigh = readBound(maxText, ceiling);
    if (nextLow === null || nextHigh === null) {
      setError(t('catalog.priceInvalid'));
      return;
    }
    if (nextLow > nextHigh) {
      setError(t('catalog.priceOrder'));
      return;
    }
    setError(null);
    setLow(nextLow);
    setHigh(nextHigh);
    commit(nextLow, nextHigh);
  }

  function updateLow(value: number) {
    const next = Math.min(Math.max(value, floor), high);
    setLow(next);
    setMinText(String(next));
  }

  function updateHigh(value: number) {
    const next = Math.max(Math.min(value, ceiling), low);
    setHigh(next);
    setMaxText(String(next));
  }

  function reset() {
    setLow(floor);
    setHigh(ceiling);
    setMinText('');
    setMaxText('');
    setError(null);
    onCommit(null, null);
  }

  return (
    <form className={styles.priceForm} onSubmit={submit} noValidate>
      <div className={styles.priceInputs}>
        <label className={styles.priceField}>
          <span className={styles.microLabel}>{t('catalog.minPrice')}</span>
          <span className={styles.priceInputWrap}>
            <span className={styles.currency}>Tk</span>
            <input
              className={styles.priceInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={minText}
              onChange={(event) => setMinText(event.target.value)}
              placeholder={String(floor)}
              aria-label={t('catalog.minPrice')}
            />
          </span>
        </label>
        <span className={styles.priceDash} aria-hidden="true">
          –
        </span>
        <label className={styles.priceField}>
          <span className={styles.microLabel}>{t('catalog.maxPrice')}</span>
          <span className={styles.priceInputWrap}>
            <span className={styles.currency}>Tk</span>
            <input
              className={styles.priceInput}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={maxText}
              onChange={(event) => setMaxText(event.target.value)}
              placeholder={String(ceiling)}
              aria-label={t('catalog.maxPrice')}
            />
          </span>
        </label>
      </div>

      <div
        className={styles.range}
        style={{ '--range-from': fromPercent + '%', '--range-to': toPercent + '%' } as CSSProperties}
      >
        <div className={styles.rangeTrack} aria-hidden="true">
          <div className={styles.rangeFill} />
        </div>
        <input
          className={styles.rangeInput}
          type="range"
          min={floor}
          max={ceiling}
          step={1}
          value={low}
          onChange={(event) => updateLow(Number(event.target.value))}
          aria-label={t('catalog.minPriceSlider')}
          aria-valuetext={price(low * 100)}
        />
        <input
          className={styles.rangeInput}
          type="range"
          min={floor}
          max={ceiling}
          step={1}
          value={high}
          onChange={(event) => updateHigh(Number(event.target.value))}
          aria-label={t('catalog.maxPriceSlider')}
          aria-valuetext={price(high * 100)}
        />
      </div>

      {error !== null && (
        <p className={styles.priceError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.priceActions}>
        <p className={styles.priceHint} aria-hidden="true">
          {price(floor * 100)} – {price(ceiling * 100)}
        </p>
        <div className={styles.priceButtons}>
          {(minPrice !== null || maxPrice !== null) && (
            <button type="button" className={styles.priceReset} onClick={reset}>
              {t('catalog.resetSection')}
            </button>
          )}
          <button type="submit" className={styles.priceApply} id={`${idPrefix}-apply`}>
            {t('catalog.applyPrice')}
          </button>
        </div>
      </div>
    </form>
  );
}
