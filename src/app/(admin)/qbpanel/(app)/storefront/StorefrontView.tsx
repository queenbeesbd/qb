'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n/dictionaries';
import { AdminIcon } from '../../_ui/icons';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { SubmitButton } from '../../_ui/SubmitButton';
import styles from '../../qbpanel.module.css';

export type StorefrontNotice = 'saved' | 'cleared' | 'denied' | 'invalid' | 'conflict';

const NOTICE_KEYS: Record<StorefrontNotice, TranslationKey> = {
  saved: 'admin.storefront.notice.saved',
  cleared: 'admin.storefront.notice.cleared',
  denied: 'admin.storefront.notice.denied',
  invalid: 'admin.storefront.notice.invalid',
  conflict: 'admin.storefront.notice.conflict',
};

const ERROR_NOTICES: readonly StorefrontNotice[] = ['denied', 'invalid', 'conflict'];

export type StorefrontCandidate = {
  id: number;
  name: string;
  slug: string;
  imageKey: string | null;
  productCount?: number;
  priceMinor?: number;
  compareAtPriceMinor?: number | null;
};

type Section = 'categories' | 'brands' | 'offers';

type Selected = Record<Section, number[]>;

const INITIAL_CANDIDATES = 10;

/**
 * Storefront -> Customisation.
 *
 * Three rows, three pickers, one save. Each picker is the same machine: the chosen things in the
 * owner's order on top (move up, move down, remove), the rest of the shop below with a filter, and a
 * cap stated in words. The whole page is one form, so the three decisions commit together - a save that
 * changed two sections and refused the third would leave the homepage disagreeing with the screen.
 *
 * **Empty means automatic**, and the page says so in each picker. A shop that has never opened this
 * screen therefore still has a homepage, and an owner who wants the shop to choose again has an obvious
 * way back: clear the row.
 *
 * A pick is never free-form: the server refuses a department that is not a live top-level category, a
 * brand that is not live, or a product that is not published **with a genuine saving**. The candidate
 * lists are built from exactly those queries, so a control the owner can press cannot produce a refusal
 * they could not have predicted.
 */
export function StorefrontView({
  notice,
  csrfToken,
  candidates,
  selected,
  limits,
}: {
  notice: StorefrontNotice | null;
  csrfToken: string;
  candidates: Record<Section, readonly StorefrontCandidate[]>;
  selected: Selected;
  limits: Record<Section, number>;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<Selected>(selected);

  const counts = (Object.keys(chosen) as Section[]).map((section) => chosen[section].length);
  const summary =
    counts.every((count) => count === 0)
      ? t('admin.storefront.summaryAutomatic')
      : t('admin.storefront.summary', {
          categories: chosen.categories.length,
          brands: chosen.brands.length,
          offers: chosen.offers.length,
        });

  return (
    <>
      {/*
        The page header states the screen; the hero is a link on the same line as its instruction, not a
        second paragraph under it (owner direction, 2026-11-20).
      */}
      <PageHeader
        title={t('admin.storefront.title')}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/qbpanel/storefront/hero">
            <AdminIcon name="image" width={16} height={16} />
            {t('admin.hero.title')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {t(NOTICE_KEYS[notice])}
        </Notice>
      )}

      <form className={styles.productForm} action="/api/qbpanel/storefront" method="post">
        <input type="hidden" name="csrf" value={csrfToken} />
        {(Object.keys(chosen) as Section[]).flatMap((section) =>
          chosen[section].map((id) => (
            <input key={`${section}-${id}`} type="hidden" name={section} value={id} />
          )),
        )}

        {/*
          The one action bar, sticky, with the counts as its summary: the page edits three lists and
          Save has to be reachable from the bottom of the longest one. It is the only bar on the page.
        */}
        <header className={styles.formHeader}>
          <div className={styles.formHeaderText}>
            <p className={styles.formSubtitle} aria-live="polite">
              {summary}
            </p>
          </div>
          <div className={styles.formHeaderActions}>
            <SubmitButton label={t('admin.storefront.save')} pendingLabel={t('admin.common.working')} />
          </div>
        </header>

        <Picker
          defaultOpen={chosen.categories.length > 0}
          section="categories"
          title={t('admin.storefront.categoriesTitle')}
          body={t('admin.storefront.categoriesBody')}
          emptyNote={t('admin.storefront.categoriesAutomatic')}
          limit={limits.categories}
          candidates={candidates.categories}
          value={chosen.categories}
          onChange={(update) =>
            setChosen((current) => ({ ...current, categories: update(current.categories) }))
          }
        />

        <Picker
          defaultOpen={chosen.brands.length > 0}
          section="brands"
          title={t('admin.storefront.brandsTitle')}
          body={t('admin.storefront.brandsBody')}
          emptyNote={t('admin.storefront.brandsAutomatic')}
          limit={limits.brands}
          candidates={candidates.brands}
          value={chosen.brands}
          onChange={(update) =>
            setChosen((current) => ({ ...current, brands: update(current.brands) }))
          }
        />

        <Picker
          defaultOpen={chosen.offers.length > 0}
          section="offers"
          title={t('admin.storefront.offersTitle')}
          body={t('admin.storefront.offersBody')}
          emptyNote={t('admin.storefront.offersAutomatic')}
          limit={limits.offers}
          candidates={candidates.offers}
          value={chosen.offers}
          onChange={(update) =>
            setChosen((current) => ({ ...current, offers: update(current.offers) }))
          }
        />
      </form>
    </>
  );
}

/**
 * One picker.
 *
 * Two lists and one filter. The chosen list is the answer the page saves; the candidate list is the
 * shop. Both show the same facts - a name and one line of context - because the owner is choosing
 * between things they already know, and a preview would be a second rendering of the storefront to keep
 * in step.
 */
function Picker({
  section,
  title,
  body,
  emptyNote,
  limit,
  candidates,
  value,
  onChange,
  defaultOpen = false,
}: {
  /** Whether this section starts expanded: a row with picks opens on what is chosen. */
  defaultOpen?: boolean;
  section: Section;
  title: string;
  body: string;
  emptyNote: string;
  limit: number;
  candidates: readonly StorefrontCandidate[];
  value: readonly number[];
  /**
   * Applied to the list **as React currently holds it**, never to the `value` this render captured:
   * two clicks in one tick (or a fast double-click) would otherwise both start from the same array and
   * one pick would vanish.
   */
  onChange: (update: (current: readonly number[]) => number[]) => void;
}) {
  const { t, price } = useTranslation();
  const [term, setTerm] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  /**
   * The candidate list is a second, long list. It is drawn only once the owner has asked for it: with
   * three sections each showing up to ten candidates the page was 5.8 phone screens, and the owner
   * opens this screen to see what is chosen far more often than to browse everything on offer.
   */
  const [browsing, setBrowsing] = useState(false);

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const chosenRows = value.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  const needle = term.trim().toLowerCase();
  const available = candidates.filter(
    (candidate) =>
      !value.includes(candidate.id) &&
      (needle === '' ||
        candidate.name.toLowerCase().includes(needle) ||
        candidate.slug.toLowerCase().includes(needle)),
  );
  const visible = expanded ? available : available.slice(0, INITIAL_CANDIDATES);
  const hidden = available.length - visible.length;
  const full = value.length >= limit;

  const move = (index: number, direction: -1 | 1): void => {
    onChange((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      const here = next[index];
      const there = next[target];
      if (here === undefined || there === undefined) return next;
      next[index] = there;
      next[target] = here;
      return next;
    });
  };

  const meta = (candidate: StorefrontCandidate): string => {
    if (section === 'offers') {
      const saving =
        candidate.priceMinor !== undefined &&
        candidate.compareAtPriceMinor !== null &&
        candidate.compareAtPriceMinor !== undefined &&
        candidate.compareAtPriceMinor > candidate.priceMinor
          ? candidate.compareAtPriceMinor - candidate.priceMinor
          : null;
      return saving === null
        ? ''
        : t('admin.storefront.offerSaving', {
            price: price(candidate.priceMinor ?? 0),
            saving: price(saving),
          });
    }
    const count = candidate.productCount ?? 0;
    return count === 1
      ? t('admin.storefront.productsCountOne')
      : t('admin.storefront.productsCount', { count });
  };

  /*
   * A collapsible section, not a stack of three long ones (owner direction, 2026-11-20).
   *
   * The page drew three sections of a chosen list plus ten candidate rows each, so the phone showed
   * 5.8 screens and the desk 3,093px to reach Save. Each section is now a disclosure whose summary
   * states the only fact the owner scans for - how many are chosen out of the cap - and a row with
   * picks opens on them, so a configured shop still shows its answer without a click.
   *
   * The candidate list is a second disclosure inside it. Browsing the shop is the occasional task; the
   * page is opened to check or reorder what is already chosen.
   */
  return (
    <section className={styles.foldSection} aria-labelledby={`sf-${section}`}>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className={styles.foldSummary}>
          <span className={styles.foldSummaryText}>
            <span className={styles.foldSummaryTitle} id={`sf-${section}`}>
              {title}
            </span>
            <span className={styles.foldSummaryMeta}>
              {value.length === 0
                ? emptyNote
                : t('admin.storefront.chosenOf', { count: value.length, limit })}
            </span>
          </span>
          <span className={styles.foldSummaryChevron} aria-hidden="true">
            <AdminIcon name="arrowDown" width={16} height={16} />
          </span>
        </summary>

        <div className={styles.foldBody}>
          {/* The row's own explanation lives inside the disclosure, not under the summary line. */}
          <p className={styles.hint}>{body}</p>
          {chosenRows.length === 0 ? (
            <p className={styles.hint}>{emptyNote}</p>
          ) : (
            <ol className={styles.recordList} data-admin-list="">
              {chosenRows.map((candidate, index) => (
                <li className={styles.record} key={candidate.id}>
                  <span className={styles.recordOrder} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className={styles.recordMain}>
                    <span className={styles.recordTitle}>{candidate.name}</span>
                    <span className={styles.recordMeta}>
                      <span>{meta(candidate)}</span>
                    </span>
                  </div>
                  <div className={styles.recordSide}>
                    <div className={styles.recordActions}>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={t('admin.storefront.moveUp', { name: candidate.name })}
                      >
                        <AdminIcon name="arrowUp" width={13} height={13} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                        onClick={() => move(index, 1)}
                        disabled={index === chosenRows.length - 1}
                        aria-label={t('admin.storefront.moveDown', { name: candidate.name })}
                      >
                        <AdminIcon name="arrowDown" width={13} height={13} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                        onClick={() => onChange((current) => current.filter((id) => id !== candidate.id))}
                      >
                        {t('admin.storefront.remove')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/*
            Adding is the second disclosure: the filter and the shop's list appear only on request, so
            a section the owner is only checking costs its chosen rows and nothing more.
          */}
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall} ${styles.storefrontBrowse}`}
            aria-expanded={browsing}
            onClick={() => setBrowsing((value) => !value)}
          >
            <AdminIcon name="plus" width={13} height={13} />
            {browsing ? t('admin.storefront.stopBrowsing') : t('admin.storefront.startBrowsing')}
          </button>

          {browsing && (
            <>
              <div className={styles.pickerHead}>
                <label className="sr-only" htmlFor={`sf-${section}-search`}>
                  {t('admin.storefront.searchLabel', { section: title })}
                </label>
                <input
                  className={styles.input}
                  id={`sf-${section}-search`}
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder={t('admin.storefront.searchPlaceholder')}
                  maxLength={60}
                  autoComplete="off"
                />
                {full && <p className={styles.hint}>{t('admin.storefront.limitReached', { limit })}</p>}
              </div>

              {available.length === 0 ? (
                <p className={styles.hint}>
                  {needle === ''
                    ? t('admin.storefront.nothingLeft')
                    : t('admin.storefront.noMatch', { query: term.trim() })}
                </p>
              ) : (
                <ul className={`${styles.recordList} ${styles.pickerList}`} data-admin-list="">
                  {visible.map((candidate) => (
                    <li className={styles.record} key={candidate.id}>
                      <div className={styles.recordMain}>
                        <span className={styles.recordTitle}>{candidate.name}</span>
                        <span className={styles.recordMeta}>
                          <span>{meta(candidate)}</span>
                        </span>
                      </div>
                      <div className={styles.recordSide}>
                        <button
                          type="button"
                          className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                          onClick={() => onChange((current) => [...current, candidate.id])}
                          disabled={full}
                          aria-label={t('admin.storefront.add', { name: candidate.name })}
                        >
                          <AdminIcon name="plus" width={13} height={13} />
                          {t('admin.storefront.addShort')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {hidden > 0 && (
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                  aria-expanded={expanded}
                  onClick={() => setExpanded((open) => !open)}
                >
                  {expanded
                    ? t('admin.storefront.showFewer')
                    : t('admin.storefront.showMore', { count: hidden })}
                </button>
              )}
            </>
          )}
        </div>
      </details>
    </section>
  );
}
