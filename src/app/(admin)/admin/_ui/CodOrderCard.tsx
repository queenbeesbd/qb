'use client';

import Link from 'next/link';

import { deliveryAreaName } from '@/lib/delivery-areas';
import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from './icons';
import { ConfirmSubmit } from './ConfirmSubmit';
import { StatusPill } from './StatusPill';
import { SubmitButton } from './SubmitButton';
import styles from '../admin.module.css';

export type CodOrderItem = {
  nameBn: string;
  nameEn: string;
  quantity: number;
  lineTotalMinor: number;
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
 * Approval is one deliberate click because the owner has already made the call; the audit note is
 * prefilled and editable rather than a typing tax on every order. Rejection is destructive - it
 * cancels the order - so it opens a confirmation that states the consequence and requires a reason.
 * Both are native posts to the guarded route; this component only removes friction.
 */
export function CodOrderCard({
  nowIso,
  row,
  csrfToken,
  canApprove,
  canCancel,
  decided,
}: {
  /** The request clock, read once by the server page. Client components stay pure. */
  nowIso: string;
  row: CodOrderRow;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  decided?: { decision: 'approved' | 'rejected'; decidedAt: string };
}) {
  const { t, price, pick, locale } = useTranslation();
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

  const placed = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(row.placedAt));

  const decidedAt =
    decided === undefined
      ? null
      : new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(decided.decidedAt));

  return (
    <article className={decided === undefined ? styles.orderCard : `${styles.orderCard} ${styles.orderCardDecided}`}>
      <div>
        <div className={styles.orderTop}>
          <span className={styles.orderRef}>{row.orderNumber}</span>
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
          {/*
            The card is the worklist entry; the order detail is the record. Opening it from here keeps
            the queue as the place a decision is made for the common case, without making the card the
            only view of an order the owner ever gets.
          */}
          <Link
            className={styles.recordLink}
            href={`/admin/orders/${encodeURIComponent(row.orderNumber)}?from=queue`}
          >
            {t('admin.cod.viewOrder')}
          </Link>
        </div>

        <div className={styles.orderBody}>
          <div className={styles.orderContact}>
            <span className={styles.orderName}>{row.recipientName}</span>
            <a className={styles.orderPhone} href={`tel:${row.recipientPhone}`}>
              <AdminIcon name="phone" width={14} height={14} />
              {row.recipientPhone}
            </a>
          </div>
          <p className={styles.orderAddress}>
            {row.addressLine}, {row.districtCode === null ? '' : `${deliveryAreaName(row.districtCode, locale)}, `}
            {row.area}, {row.city}
          </p>
          <ul className={styles.orderItems} aria-label={t('admin.cod.itemsTitle')}>
            {row.items.map((item, index) => (
              <li className={styles.orderItem} key={`${item.nameEn}-${index}`}>
                <span className={styles.orderItemName}>
                  {pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn}
                </span>
                <span className={styles.orderItemQty}>
                  ×{item.quantity} · {price(item.lineTotalMinor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.orderSide}>
        <div>
          <dl className={styles.orderTotals}>
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{price(row.itemsSubtotalMinor)}</dd>
            </div>
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
          <div className={styles.orderActions}>
            <form action="/api/admin/orders-cod" method="post" className={styles.approveForm}>
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="orderId" value={row.orderId} />
              <input type="hidden" name="decision" value="approve" />
              {/*
                * Open by default and labelled as required. The field always was `required` with a
                * 10-character minimum, but the summary said "optional" - so an owner who collapsed it
                * and cleared the pre-filled value hit a refusal they had been told could not happen
                * (Phase 24 A-14 / F-05).
                */}
              <details className={styles.noteDetails} open>
                <summary>{t('admin.cod.noteSummary')}</summary>
                <label className="sr-only" htmlFor={`reason-${row.orderId}`}>
                  {t('admin.cod.approveReason')}
                </label>
                <input
                  id={`reason-${row.orderId}`}
                  name="reason"
                  className={styles.input}
                  required
                  minLength={10}
                  maxLength={500}
                  defaultValue={t('admin.cod.approveReasonDefault')}
                />
              </details>
              <SubmitButton
                label={t('admin.cod.approve')}
                pendingLabel={t('admin.common.working')}
                disabled={!canApprove}
                wide
              />
            </form>

            {canCancel ? (
              <ConfirmSubmit
                action="/api/admin/orders-cod"
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
                  required: true,
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
