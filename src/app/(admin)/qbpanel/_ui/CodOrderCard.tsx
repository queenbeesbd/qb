'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';

import { deliveryAddressText } from '@/lib/delivery-address';
import { orderDiscountMinor } from '@/lib/money';
import { ORDERS_PATH } from '@/server/auth/constants';
import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import { ConfirmSubmit } from './ConfirmSubmit';
import { ItemPhoto } from './ItemPhoto';
import { RequiredMark } from './RequiredMark';
import { StatusPill } from './StatusPill';
import { SubmitButton } from './SubmitButton';
import styles from '../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type CodOrderItem = {
  nameBn: string | null;
  nameEn: string;
  quantity: number;
  lineTotalMinor: number;
  /** The photograph recorded on the order line, or `null` when it stored none (2026-11-19). */
  imageKey: string | null;
};

export type CodOrderRow = {
  orderId: number;
  orderNumber: string;
  placedAt: string;
  itemsSubtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  recipientName: string;
  districtCode: string | null;
  recipientPhone: string;
  area: string;
  city: string;
  addressLine: string;
  items: readonly CodOrderItem[];
};

export type CodDecidedRow = CodOrderRow & {
  decision: 'approved' | 'rejected';
  decidedAt: string;
};

/** Age is the operational fact: a waiting COD order is a customer nobody has called. */
function ageOf(placedAt: string, now: number): { minutes: number; hours: number; days: number } {
  const elapsed = Math.max(0, now - new Date(placedAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  return { minutes, hours: Math.floor(minutes / 60), days: Math.floor(minutes / 1440) };
}

/**
 * One COD order, decided inline.
 *
 * Approval is one deliberate click because the owner has already made the call. The audit note is a
 * **placeholder**, not a prefilled value (owner feedback, 2026-11-10): clicking the field must start
 * from empty, and pressing Accept without typing records the default note. A prefilled value made the
 * owner backspace it out before every order. Rejection is destructive - it cancels the order - so it
 * opens a confirmation that states the consequence and requires a reason.
 * Both are native posts to the guarded route; this component only removes friction.
 */
export function CodOrderCard({
  nowIso,
  row,
  csrfToken,
  canApprove,
  canCancel,
  decided,
  compact = false,
}: {
  /** The request clock, read once by the server page. Client components stay pure. */
  nowIso: string;
  row: CodOrderRow;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  decided?: { decision: 'approved' | 'rejected'; decidedAt: string };
  /**
   * The dashboard's version of the card: one recorded line, no street address, totals next to the
   * decision. The queue page keeps the full card; the dashboard is a triage surface, and the owner
   * must be able to reach Accept on a phone without scrolling past every line of the order.
   */
  compact?: boolean;
}) {
  const { t, price, pick } = useTranslation();
  const age = ageOf(row.placedAt, new Date(nowIso).getTime());
  const hot = age.hours >= 24;
  const ageText =
    age.minutes < 1
      ? t('admin.cod.ageJustNow')
      : age.minutes < 60
        ? t('admin.cod.ageMinutes', { count: age.minutes })
        : age.hours < 24
          ? t('admin.cod.ageHours', { count: age.hours })
          : t('admin.cod.ageDays', { count: age.days });

  const placed = new Intl.DateTimeFormat(INTL_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(row.placedAt));

  const decidedAt =
    decided === undefined
      ? null
      : new Intl.DateTimeFormat(INTL_LOCALE, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(decided.decidedAt));

  /**
   * Approve with an empty note records the default one. The field starts empty (the default is its
   * placeholder), so this fills the value at submit time instead of making the owner clear a prefilled
   * sentence first. The server applies the same default, so the no-JavaScript path behaves identically.
   */
  function fillDefaultReason(event: FormEvent<HTMLFormElement>) {
    const field = event.currentTarget.elements.namedItem('reason');
    if (field instanceof HTMLInputElement && field.value.trim() === '') {
      field.value = t('admin.cod.approveReasonDefault');
    }
  }

  return (
    <article
      data-cod-card=""
      className={[
        styles.orderCard,
        decided === undefined ? '' : styles.orderCardDecided,
        compact ? styles.orderCardCompact : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ position: 'relative' }}
    >
      {/*
        The card's open area: one empty anchor stretched over the article (`inset: 0`), never a wrapper
        around the decision forms. The card is the worklist entry and the order detail is the record, so
        a tap anywhere that is not a control opens the order. The phone link, the line photographs and
        the decision controls are raised above this overlay below, which is why each of them keeps its
        own activation: an anchor that contained a form would submit through the link.
      */}
      <Link
        aria-label={`${t('admin.cod.viewOrder')} ${row.orderNumber}`}
        className={styles.recordLink}
        data-cod-card-link=""
        href={`${ORDERS_PATH}/${encodeURIComponent(row.orderNumber)}?from=orders`}
        style={{ position: 'absolute', inset: 0, zIndex: 0, outlineOffset: '-2px' }}
      />

      <div className={styles.orderMain}>
        <div className={styles.orderTop}>
          {/*
            The reference is the card's own heading, so it is set at the page's body size rather than
            the utility size a metadata line uses (owner direction, 2026-11-19): on the merged Orders
            screen a card is the row, and the number is what the owner scans for.
          */}
          <span className={styles.orderRef} style={{ fontSize: 'var(--text-lg)' }}>
            {row.orderNumber}
          </span>
          {decided === undefined ? (
            <span className={hot ? `${styles.orderAge} ${styles.orderAgeHot}` : styles.orderAge}>
              <AdminIcon name="clock" width={13} height={13} />
              {ageText}
            </span>
          ) : (
            <StatusPill tone={decided.decision === 'approved' ? 'success' : 'danger'}>
              {decided.decision === 'approved' ? t('admin.cod.decision.approved') : t('admin.cod.decision.rejected')}
            </StatusPill>
          )}
          <span className={styles.orderWhen}>
            {decided === undefined
              ? t('admin.cod.placedAt', { time: placed })
              : t('admin.cod.decidedAt', { time: decidedAt ?? placed })}
          </span>
        </div>

        <div className={styles.orderBody}>
          <div className={styles.orderContact}>
            <span className={styles.orderName}>{row.recipientName}</span>
            {/*
              Raised above the card's stretched overlay: calling the customer is its own action and must
              not also open the order. Every control that does something other than "open the record"
              carries this, which is what makes one whole-card link safe beside real forms.
            */}
            <a
              className={styles.orderPhone}
              href={`tel:${row.recipientPhone}`}
              style={{ position: 'relative', zIndex: 1 }}
            >
              <AdminIcon name="phone" width={14} height={14} />
              {row.recipientPhone}
            </a>
          </div>
          {!compact && (
            <p className={styles.orderAddress}>{deliveryAddressText(row)}</p>
          )}
          <ul className={styles.orderItems} aria-label={t('admin.cod.itemsTitle')}>
            {(compact ? row.items.slice(0, 1) : row.items).map((item, index) => (
              <li className={styles.orderItemLine} key={`${item.nameEn}-${index}`}>
                {/*
                  The line's recorded photograph (owner direction, 2026-11-19): the owner approves an
                  order on a call and recognises the bottle, not the vendor's product name. A line with
                  no stored snapshot draws no tile, so the name still starts where it did.
                */}
                <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
                  <ItemPhoto
                    imageKey={item.imageKey}
                    name={pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn}
                    size="compact"
                  />
                </span>
                <span className={styles.orderItem}>
                  <span className={styles.orderItemName}>
                    {pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn}
                  </span>
                  <span className={styles.orderItemQty}>
                    ×{item.quantity} · {price(item.lineTotalMinor)}
                  </span>
                </span>
              </li>
            ))}
            {compact && row.items.length > 1 && (
              <li className={styles.orderItemMore}>
                {t('admin.cod.moreItems', { count: row.items.length - 1 })}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className={styles.orderSide}>
        <dl className={styles.orderTotals}>
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{price(row.itemsSubtotalMinor)}</dd>
            </div>
            {orderDiscountMinor(row.itemsSubtotalMinor, row.shippingMinor, row.totalMinor) > 0 && (
              <div>
                <dt>{t('orders.discount')}</dt>
                <dd>
                  −{price(orderDiscountMinor(row.itemsSubtotalMinor, row.shippingMinor, row.totalMinor))}
                </dd>
              </div>
            )}
            <div>
              <dt>{t('cart.delivery')}</dt>
              <dd>
                {row.districtCode === null ? t('orders.deliveryPending') : price(row.shippingMinor)}
              </dd>
            </div>
            <div className={styles.orderTotalRow}>
              <dt>{t('admin.cod.total')}</dt>
              <dd className={styles.orderTotal}>{price(row.totalMinor)}</dd>
            </div>
        </dl>
      </div>

      {decided === undefined ? (
        <div className={styles.orderFooter} style={{ position: 'relative', zIndex: 1 }}>
          <form
            action="/api/qbpanel/orders-cod"
            method="post"
            className={`${styles.approveForm} ${styles.approveFormRow}`}
            onSubmit={fillDefaultReason}
          >
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="orderId" value={row.orderId} />
              <input type="hidden" name="decision" value="approve" />
              {/*
                * Open by default and labelled as required. The note is the row's **placeholder**, so
                * the field starts empty: clicking it means typing your own note, not clearing ours.
                * Pressing Accept with it empty records the default note (here in `onSubmit`, and on
                * the server for the no-JavaScript path). No native `required`/`minLength` on the field:
                * with `required` the browser would block the very empty submission this is meant to
                * accept, before `onSubmit` could fill it. A typed note is still validated (10-500) by
                * the input and re-validated by the service.
                */}
              <details className={styles.noteDetails} open>
                <summary>
                  {t('admin.cod.noteSummary')} <RequiredMark />
                </summary>
                <label className="sr-only" htmlFor={`reason-${row.orderId}`}>
                  {t('admin.cod.approveReason')}
                </label>
                <input
                  id={`reason-${row.orderId}`}
                  name="reason"
                  className={styles.input}
                  minLength={10}
                  maxLength={500}
                  placeholder={t('admin.cod.approveReasonDefault')}
                  aria-describedby={`reason-hint-${row.orderId}`}
                />
                <p className={styles.hint} id={`reason-hint-${row.orderId}`}>
                  {t('admin.cod.noteSummaryHint')}
                </p>
              </details>
              <SubmitButton
                label={t('admin.cod.approve')}
                pendingLabel={t('admin.common.working')}
                disabled={!canApprove}
              />
            </form>

            {canCancel ? (
              <ConfirmSubmit
                action="/api/qbpanel/orders-cod"
                csrfToken={csrfToken}
                fields={{ orderId: row.orderId, decision: 'reject' }}
                triggerLabel={t('admin.cod.reject')}
                triggerVariant="dangerOutline"
                title={t('admin.cod.rejectTitle')}
                body={t('admin.cod.rejectBody')}
                confirmLabel={t('admin.cod.rejectConfirm')}
                cancelLabel={t('admin.common.cancel')}
                pendingLabel={t('admin.common.working')}
                reason={{
                  label: t('admin.cod.rejectReason'),
                  placeholder: t('admin.cod.rejectReasonPlaceholder'),
                  minLength: 10,
                  maxLength: 500,
                  /*
                    Optional (owner direction, 2026-11-19): refusing an order is a decision the owner
                    makes on the call, and being made to type ten characters first turned a two-tap act
                    into a form. A typed note still has to be a real sentence; an empty one records
                    "No reason recorded." so the cancelled order and the audit row are never blank.
                  */
                  required: false,
                }}
              />
            ) : null}
        </div>
      ) : null}
    </article>
  );
}
