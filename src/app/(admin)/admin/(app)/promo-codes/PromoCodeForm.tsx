'use client';

import Link from 'next/link';
import { useState } from 'react';

import { INTL_LOCALE } from '@/i18n/config';
import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { parseBdtInput } from '@/lib/money';
import { promoDiscountMinor, type PromoRule } from '@/lib/promo';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { RequiredMark } from '../../_ui/RequiredMark';
import { StatusPill } from '../../_ui/StatusPill';
import { SubmitButton } from '../../_ui/SubmitButton';
import styles from '../../admin.module.css';
import type { PromoNotice } from './PromoCodesView';

const NOTICE_KEYS: Record<PromoNotice, TranslationKey> = {
  created: 'admin.promo.notice.created',
  saved: 'admin.promo.notice.saved',
  activated: 'admin.promo.notice.activated',
  paused: 'admin.promo.notice.paused',
  denied: 'admin.promo.notice.denied',
  conflict: 'admin.promo.notice.conflict',
  invalid: 'admin.promo.notice.invalid',
  missing: 'admin.promo.notice.missing',
};

const ERROR_NOTICES: readonly PromoNotice[] = ['denied', 'conflict', 'invalid', 'missing'];

import type { PromoFormValues } from './promo-form-values';

/** The visible controls of the editor, named by their own `name` attribute. */
type PromoField =
  | 'code'
  | 'percentOff'
  | 'amountOff'
  | 'minOrder'
  | 'maxDiscount'
  | 'maxRedemptions'
  | 'startsAt'
  | 'endsAt';

function controlName(control: HTMLElement): string {
  return control.getAttribute('name') ?? '';
}

function violatesConstraint(control: HTMLElement): boolean {
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    return !control.checkValidity();
  }
  return false;
}

export type PromoFormStats = {
  isActive: boolean;
  redemptions: number;
  discountGivenMinor: number;
  createdAt: string;
};

/**
 * The promotion code editor.
 *
 * One rule per screen, with the effect of that rule shown while it is being typed: sampling three
 * cart totals makes a percentage cap legible ("10% up to Tk 500" stops being arithmetic and becomes
 * three numbers), and it is the same function the checkout and the order use, so the preview cannot
 * promise something the server will refuse.
 *
 * Validation is explicit and named - the missing set is listed above the button rather than left to a
 * native bubble that disappears with the scroll.
 */
export function PromoCodeForm({
  mode,
  id,
  initial,
  stats,
  notice,
  csrfToken,
}: {
  mode: 'create' | 'edit';
  id?: number;
  initial: PromoFormValues;
  stats?: PromoFormStats;
  notice: PromoNotice | null;
  csrfToken: string;
}) {
  const { t, price } = useTranslation();
  const [form, setForm] = useState<PromoFormValues>(initial);
  /*
   * A refused submission is state, not a message the browser draws and forgets.
   *
   * The form is `noValidate` because native validation refuses the submit *before* `onSubmit` runs:
   * an empty required Code produced no summary at all, so "Create code" appeared to do nothing. This
   * holds the fields that blocked the save, which is what puts the summary on screen, marks the
   * controls and decides where focus goes. Server-side validation stays authoritative.
   */
  const [blocked, setBlocked] = useState<{ fields: readonly string[]; unlisted: boolean }>({
    fields: [],
    unlisted: false,
  });
  const isFlagged = (field: PromoField): boolean => blocked.fields.includes(field);

  function set<K extends keyof PromoFormValues>(key: K, value: PromoFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const codeOk = /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(form.code.trim().toUpperCase());
  const percentValue = /^\d{1,3}$/.test(form.percentOff.trim()) ? Number(form.percentOff.trim()) : null;
  const amountMinor = parseBdtInput(form.amountOff);
  const minOrderMinor = form.minOrder.trim() === '' ? 0 : parseBdtInput(form.minOrder);
  const maxDiscountMinor =
    form.maxDiscount.trim() === '' ? null : parseBdtInput(form.maxDiscount);
  const limitValue = form.maxRedemptions.trim() === '' ? null : Number(form.maxRedemptions.trim());

  /*
   * Every problem names the control it belongs to, so the summary can mark the offender as well as
   * describe it. `field` is the input's `name`, which is what the browser-invalid pass below also
   * speaks, so one list drives both the message and the focus.
   */
  const problems: { field: PromoField; message: string }[] = [];
  if (!codeOk) problems.push({ field: 'code', message: t('admin.promo.problemCode') });
  if (form.kind === 'percent' && (percentValue === null || percentValue < 1 || percentValue > 100)) {
    problems.push({ field: 'percentOff', message: t('admin.promo.problemPercent') });
  }
  if (form.kind === 'fixed' && amountMinor === null) {
    problems.push({ field: 'amountOff', message: t('admin.promo.problemAmount') });
  }
  if (minOrderMinor === null) problems.push({ field: 'minOrder', message: t('admin.promo.problemMinimum') });
  if (form.kind === 'percent' && form.maxDiscount.trim() !== '' && maxDiscountMinor === null) {
    problems.push({ field: 'maxDiscount', message: t('admin.promo.problemCap') });
  }
  if (limitValue !== null && (!Number.isSafeInteger(limitValue) || limitValue <= 0)) {
    problems.push({ field: 'maxRedemptions', message: t('admin.promo.problemLimit') });
  }
  if (form.startsAt !== '' && form.endsAt !== '' && form.endsAt < form.startsAt) {
    problems.push({ field: 'endsAt', message: t('admin.promo.problemWindow') });
  }

  // The preview runs the shipped evaluator, not a second copy of the arithmetic.
  const rule: PromoRule = {
    code: form.code.trim().toUpperCase() || 'CODE',
    kind: form.kind,
    percentOff: percentValue,
    amountOffMinor: amountMinor,
    minOrderMinor: minOrderMinor ?? 0,
    maxDiscountMinor,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    isActive: true,
  };
  // Sampled in taka, converted once: a preview of "Tk 10" carts would tell the owner nothing.
  const floor = minOrderMinor ?? 0;
  const samples = [...new Set([floor > 0 ? floor : 100_000, 300_000, 600_000])]
    .filter((value) => value >= floor)
    .sort((a, b) => a - b);
  const created = stats === undefined ? null : new Intl.DateTimeFormat(INTL_LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(stats.createdAt));

  return (
    <>
      <PageHeader
        title={mode === 'create' ? t('admin.promo.newTitle') : t('admin.promo.editTitle')}
        description={mode === 'edit' ? t('admin.promo.editBody') : undefined}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/admin/promo-codes">
            {t('admin.promo.backToList')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      <div className={styles.promoEditor}>
        <form
          className={styles.formCard}
          action="/api/admin/promo-codes"
          method="post"
          /*
           * The browser's own validation is taken over deliberately: with it on, an empty required
           * Code stopped the submit before this handler ran and nothing was announced. `noValidate`
           * hands the same constraints (required / min / max / maxLength) to one reporter, which lists
           * the problems, marks the fields and focuses the first one. No rule was weakened, and the
           * server still validates everything it is sent.
           */
          noValidate
          onSubmit={(event) => {
            const form = event.currentTarget;
            const controls = [...form.querySelectorAll<HTMLElement>('input[name], select[name], textarea[name]')];
            const browserInvalid = controls.filter(violatesConstraint).map(controlName);
            const fields = [...new Set([...problems.map((problem) => problem.field), ...browserInvalid])];

            setBlocked({ fields, unlisted: fields.length > 0 && problems.length === 0 });

            if (fields.length === 0) return;

            event.preventDefault();
            form.querySelector<HTMLElement>(`[name="${fields[0] ?? ''}"]`)?.focus();
          }}
        >
          <input type="hidden" name="csrf" value={csrfToken} />
          <input type="hidden" name="operation" value={mode === 'create' ? 'create' : 'update'} />
          {id !== undefined && <input type="hidden" name="id" value={id} />}
          <input type="hidden" name="returnTo" value={id === undefined ? '/admin/promo-codes' : `/admin/promo-codes/${id}`} />

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>
                {t('admin.promo.fieldCode')} <RequiredMark />
              </span>
              <input
                className={styles.input}
                name="code"
                type="text"
                required
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                value={form.code}
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                aria-describedby="promo-code-hint"
                aria-invalid={isFlagged('code') || undefined}
              />
              <small id="promo-code-hint">{t('admin.promo.fieldCodeHint')}</small>
            </label>

            <label className={styles.field}>
              <span>{t('admin.promo.fieldKind')}</span>
              <select
                className={styles.select}
                name="kind" value={form.kind} onChange={(event) => set('kind', event.target.value as 'percent' | 'fixed')}>
                <option value="percent">{t('admin.promo.kindPercent')}</option>
                <option value="fixed">{t('admin.promo.kindFixed')}</option>
              </select>
            </label>

            {form.kind === 'percent' ? (
              <label className={styles.field}>
                <span>
                  {t('admin.promo.fieldPercent')} <RequiredMark />
                </span>
                <input
                  className={styles.input}
                  name="percentOff"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={form.percentOff}
                  onChange={(event) => set('percentOff', event.target.value)}
                  aria-invalid={isFlagged('percentOff') || undefined}
                />
                <small>{t('admin.promo.fieldPercentHint')}</small>
              </label>
            ) : (
              <label className={styles.field}>
                <span>
                  {t('admin.promo.fieldAmount')} <RequiredMark />
                </span>
                <input
                  className={styles.input}
                  name="amountOff"
                  type="text"
                  inputMode="decimal"
                  placeholder="100"
                  value={form.amountOff}
                  onChange={(event) => set('amountOff', event.target.value)}
                  aria-invalid={isFlagged('amountOff') || undefined}
                />
                <small>{t('admin.promo.fieldAmountHint')}</small>
              </label>
            )}

            <label className={styles.field}>
              <span>{t('admin.promo.fieldMinimum')}</span>
              <input
                className={styles.input}
                name="minOrder"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={form.minOrder}
                onChange={(event) => set('minOrder', event.target.value)}
                aria-invalid={isFlagged('minOrder') || undefined}
              />
              <small>{t('admin.promo.fieldMinimumHint')}</small>
            </label>

            {form.kind === 'percent' && (
              <label className={styles.field}>
                <span>{t('admin.promo.fieldCap')}</span>
                <input
                  className={styles.input}
                  name="maxDiscount"
                  type="text"
                  inputMode="decimal"
                  placeholder={t('admin.promo.fieldCapPlaceholder')}
                  value={form.maxDiscount}
                  onChange={(event) => set('maxDiscount', event.target.value)}
                  aria-invalid={isFlagged('maxDiscount') || undefined}
                />
                <small>{t('admin.promo.fieldCapHint')}</small>
              </label>
            )}

            <label className={styles.field}>
              <span>{t('admin.promo.fieldLimit')}</span>
              <input
                className={styles.input}
                name="maxRedemptions"
                type="number"
                min={1}
                step={1}
                placeholder={t('admin.promo.fieldLimitPlaceholder')}
                value={form.maxRedemptions}
                onChange={(event) => set('maxRedemptions', event.target.value)}
                aria-invalid={isFlagged('maxRedemptions') || undefined}
              />
              <small>{t('admin.promo.fieldLimitHint')}</small>
            </label>

            <label className={styles.field}>
              <span>{t('admin.promo.fieldStarts')}</span>
              <input
                className={styles.input}
                name="startsAt"
                type="date"
                value={form.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
                aria-invalid={isFlagged('startsAt') || undefined}
              />
              <small>{t('admin.promo.fieldStartsHint')}</small>
            </label>

            <label className={styles.field}>
              <span>{t('admin.promo.fieldEnds')}</span>
              <input
                className={styles.input}
                name="endsAt"
                type="date"
                value={form.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
                aria-invalid={isFlagged('endsAt') || undefined}
              />
              <small>{t('admin.promo.fieldEndsHint')}</small>
            </label>
          </div>

          <label className={styles.field}>
            <span>{t('admin.promo.fieldNote')}</span>
            <input
              className={styles.input}
              name="description"
              type="text"
              maxLength={200}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
            <small>{t('admin.promo.fieldNoteHint')}</small>
          </label>

          {blocked.fields.length > 0 && (
            <div className={styles.formBlocked} role="alert">
              <div>
                <p>{t('admin.promo.problemsTitle')}</p>
                {problems.length > 0 && (
                  <ul>
                    {problems.map((problem) => (
                      <li key={problem.field}>{problem.message}</li>
                    ))}
                  </ul>
                )}
                {/*
                  A constraint the list above does not name (a browser range or length rule) still has to
                  say something, otherwise the summary would be an empty refusal.
                */}
                {blocked.unlisted && <p>{t('admin.promo.problemFields')}</p>}
              </div>
            </div>
          )}

          <div className={styles.formActions}>
            <SubmitButton
              label={mode === 'create' ? t('admin.promo.save') : t('admin.promo.saveChanges')}
              pendingLabel={t('admin.promo.saving')}
            />
            <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/admin/promo-codes">
              {t('admin.promo.cancel')}
            </Link>
          </div>
        </form>

        <aside className={styles.promoAside}>
          <section className={styles.formCard} aria-labelledby="promo-preview">
            <h2 id="promo-preview" className={styles.formSubtitle}>
              {t('admin.promo.previewTitle')}
            </h2>
            <p className={styles.hint}>{t('admin.promo.previewBody')}</p>
            <ul className={styles.previewSamples}>
              {samples.map((sample) => {
                const discount = promoDiscountMinor(rule, sample);
                return (
                  <li key={sample}>
                    <span>{t('admin.promo.previewCart', { amount: price(sample) })}</span>
                    <span className={discount > 0 ? styles.previewSaving : styles.hint}>
                      {discount > 0 ? `− ${price(discount)}` : t('admin.promo.previewNoChange')}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.note}>{t('admin.promo.previewNote')}</p>
          </section>

          {stats !== undefined && (
            <section className={styles.formCard} aria-labelledby="promo-stats">
              <h2 id="promo-stats" className={styles.formSubtitle}>
                {t('admin.promo.statsTitle')}
              </h2>
              <div className={styles.promoStats}>
                <div>
                  <span className={styles.promoStatValue}>
                    <StatusPill tone={stats.isActive ? 'success' : 'warning'}>
                      {stats.isActive ? t('admin.promo.stateLive') : t('admin.promo.statePaused')}
                    </StatusPill>
                  </span>
                  <span className={styles.promoStatLabel}>{t('admin.promo.statsState')}</span>
                </div>
                <div>
                  <span className={styles.promoStatValue}>{stats.redemptions}</span>
                  <span className={styles.promoStatLabel}>{t('admin.promo.statsUses')}</span>
                </div>
                <div>
                  <span className={styles.promoStatValue}>{price(stats.discountGivenMinor)}</span>
                  <span className={styles.promoStatLabel}>{t('admin.promo.statsGiven')}</span>
                </div>
                <div>
                  <span className={styles.promoStatValue}>{created}</span>
                  <span className={styles.promoStatLabel}>{t('admin.promo.statsCreated')}</span>
                </div>
              </div>

              {id !== undefined && (
                <form action="/api/admin/promo-codes" method="post" className={styles.formActions}>
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="operation" value="setActive" />
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="active" value={stats.isActive ? 'false' : 'true'} />
                  <input type="hidden" name="returnTo" value={`/admin/promo-codes/${id}`} />
                  <SubmitButton
                    small
                    variant={stats.isActive ? 'dangerOutline' : 'secondary'}
                    label={stats.isActive ? t('admin.promo.pause') : t('admin.promo.activate')}
                    pendingLabel={t('admin.promo.saving')}
                  />
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

