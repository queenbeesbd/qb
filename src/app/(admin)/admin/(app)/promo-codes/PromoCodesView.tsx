'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { INTL_LOCALE } from '@/i18n/config';
import type { TranslationKey } from '@/i18n/dictionaries';
import { EmptyState } from '../../_ui/EmptyState';
import { Notice } from '../../_ui/Notice';
import { PageHeader } from '../../_ui/PageHeader';
import { StatusPill } from '../../_ui/StatusPill';
import { SubmitButton } from '../../_ui/SubmitButton';
import styles from '../../admin.module.css';

export type PromoListRow = {
  id: number;
  code: string;
  description: string | null;
  kind: 'percent' | 'fixed';
  percentOff: number | null;
  amountOffMinor: number | null;
  minOrderMinor: number;
  maxDiscountMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  isActive: boolean;
  redemptions: number;
  discountGivenMinor: number;
};

export type PromoNotice =
  | 'created'
  | 'saved'
  | 'activated'
  | 'paused'
  | 'denied'
  | 'conflict'
  | 'invalid'
  | 'missing';

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

/**
 * The promotion codes.
 *
 * One row per code, active first, because the question this screen answers is "which discounts are
 * running and what have they cost me". The rule, its floor, its ceiling and its use are stated as
 * facts on the row rather than hidden behind an edit screen: an owner should be able to read a code
 * out to a customer without opening anything.
 *
 * A code that has run out of time says so, and stays in the list - deleting it would erase the orders
 * that used it from the record the owner is reading.
 */
export function PromoCodesView({
  codes,
  notice,
  csrfToken,
  nowIso,
}: {
  codes: readonly PromoListRow[];
  notice: PromoNotice | null;
  csrfToken: string;
  nowIso: string;
}) {
  const { t, price } = useTranslation();
  const now = new Date(nowIso);
  const dayFormat = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

  const activeCount = codes.filter((code) => code.isActive).length;
  const totalUses = codes.reduce((total, code) => total + code.redemptions, 0);
  const totalGiven = codes.reduce((total, code) => total + code.discountGivenMinor, 0);

  function ruleLabel(code: PromoListRow): string {
    if (code.kind === 'percent') {
      const base = t('admin.promo.percentOff', { percent: code.percentOff ?? 0 });
      return code.maxDiscountMinor === null
        ? base
        : t('admin.promo.percentOffCapped', {
            percent: code.percentOff ?? 0,
            cap: price(code.maxDiscountMinor),
          });
    }
    return t('admin.promo.amountOff', { amount: price(code.amountOffMinor ?? 0) });
  }

  function windowLabel(code: PromoListRow): string {
    if (code.endsAt !== null && new Date(code.endsAt) <= now) {
      return t('admin.promo.endedOn', { date: dayFormat.format(new Date(code.endsAt)) });
    }
    if (code.startsAt !== null && new Date(code.startsAt) > now) {
      return t('admin.promo.startsOn', { date: dayFormat.format(new Date(code.startsAt)) });
    }
    if (code.endsAt === null) return t('admin.promo.noEnd');
    return t('admin.promo.endsOn', { date: dayFormat.format(new Date(code.endsAt)) });
  }

  function state(code: PromoListRow): { tone: 'success' | 'warning' | 'neutral'; label: string } {
    if (code.endsAt !== null && new Date(code.endsAt) <= now) {
      return { tone: 'neutral', label: t('admin.promo.stateEnded') };
    }
    if (!code.isActive) return { tone: 'warning', label: t('admin.promo.statePaused') };
    if (code.startsAt !== null && new Date(code.startsAt) > now) {
      return { tone: 'warning', label: t('admin.promo.stateScheduled') };
    }
    return { tone: 'success', label: t('admin.promo.stateLive') };
  }

  return (
    <>
      <PageHeader
        title={t('admin.promo.title')}
        description={t('admin.promo.body')}
        actions={
          <Link className={`${styles.button}`} href="/admin/promo-codes/new">
            {t('admin.promo.new')}
          </Link>
        }
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>{t(NOTICE_KEYS[notice])}</Notice>
      )}

      {codes.length === 0 ? (
        <EmptyState title={t('admin.promo.emptyTitle')} body={t('admin.promo.emptyBody')} icon="tag" />
      ) : (
        <>
          <dl className={styles.promoSummary}>
            <div>
              <dt>{t('admin.promo.summaryActive')}</dt>
              <dd>{activeCount}</dd>
            </div>
            <div>
              <dt>{t('admin.promo.summaryUses')}</dt>
              <dd>{totalUses}</dd>
            </div>
            <div>
              <dt>{t('admin.promo.summaryGiven')}</dt>
              <dd>{price(totalGiven)}</dd>
            </div>
          </dl>

          <ul className={styles.promoList}>
            {codes.map((code) => {
              const status = state(code);
              return (
                <li key={code.id} className={styles.promoRow} data-paused={!code.isActive || undefined}>
                  <div className={styles.promoIdent}>
                    <span className={styles.promoCode}>{code.code}</span>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    {code.description !== null && <p className={styles.promoNote}>{code.description}</p>}
                  </div>

                  <dl className={styles.promoFacts}>
                    <div>
                      <dt>{t('admin.promo.factDiscount')}</dt>
                      <dd>{ruleLabel(code)}</dd>
                    </div>
                    <div>
                      <dt>{t('admin.promo.factMinimum')}</dt>
                      <dd>
                        {code.minOrderMinor === 0
                          ? t('admin.promo.noMinimum')
                          : price(code.minOrderMinor)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('admin.promo.factUsed')}</dt>
                      <dd>
                        {code.maxRedemptions === null
                          ? t('admin.promo.usedOfUnlimited', { used: code.redemptions })
                          : t('admin.promo.usedOfLimit', {
                              used: code.redemptions,
                              limit: code.maxRedemptions,
                            })}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('admin.promo.factWindow')}</dt>
                      <dd>{windowLabel(code)}</dd>
                    </div>
                  </dl>

                  <div className={styles.promoActions}>
                    <Link
                      className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                      href={`/admin/promo-codes/${code.id}`}
                    >
                      {t('admin.promo.edit')}
                    </Link>
                    <form action="/api/admin/promo-codes" method="post">
                      <input type="hidden" name="csrf" value={csrfToken} />
                      <input type="hidden" name="operation" value="setActive" />
                      <input type="hidden" name="id" value={code.id} />
                      <input type="hidden" name="active" value={code.isActive ? 'false' : 'true'} />
                      <input type="hidden" name="returnTo" value="/admin/promo-codes" />
                      <SubmitButton
                        small
                        variant="ghost"
                        label={code.isActive ? t('admin.promo.pause') : t('admin.promo.activate')}
                        pendingLabel={t('admin.promo.saving')}
                      />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
