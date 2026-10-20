'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { EmptyState } from '../../../_ui/EmptyState';
import { Notice, type NoticeTone } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { StatusPill, type PillTone } from '../../../_ui/StatusPill';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../admin.module.css';

export type AdminOrderNotice = 'approved' | 'rejected' | 'denied' | 'conflict' | 'invalid';

export type AdminOrderDetailModel = {
  /** Internal identity, needed only by the decision form the server re-authorizes. */
  orderId: number;
  orderNumber: string;
  placedAt: string;
  status: string;
  paymentMethod: string;
  paymentState: string;
  codState: string;
  itemsSubtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  /** `email` is null when the viewer may not read customer profiles; it is not sent at all. */
  customer: { id: number; email: string | null; displayName: string | null; status: string };
  contact: {
    recipientName: string;
    recipientPhone: string;
    addressLine: string;
    districtCode: string | null;
    area: string;
    city: string;
    postcode: string | null;
    deliveryNote: string | null;
  };
  items: readonly {
    id: number;
    nameBn: string;
    nameEn: string;
    variantLabel: string | null;
    sku: string;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
  }[];
  events: readonly {
    id: number;
    eventType: string;
    fromValue: string | null;
    toValue: string | null;
    actorType: string;
    actorStaffId: number | null;
    reason: string | null;
    occurredAt: string;
  }[];
  /** Only present when the principal holds `audit.read`. */
  audit: readonly {
    id: number;
    action: string;
    actorType: string;
    actorStaffId: number | null;
    actorRoleCodes: readonly string[];
    reason: string | null;
    occurredAt: string;
  }[] | null;
};

const NOTICE_KEYS: Record<AdminOrderNotice, TranslationKey> = {
  approved: 'admin.cod.notice.approved',
  rejected: 'admin.cod.notice.rejected',
  denied: 'admin.cod.notice.denied',
  conflict: 'admin.cod.notice.conflict',
  invalid: 'admin.cod.notice.invalid',
};

const ERROR_NOTICES: readonly AdminOrderNotice[] = ['denied', 'conflict', 'invalid'];

/**
 * Event types this release can actually write, translated. Anything else is shown as its stored code:
 * a label the store cannot substantiate would be a claim, and the code is the honest fact.
 */
const EVENT_KEYS: Record<string, TranslationKey> = {
  order_placed: 'admin.order.event.order_placed',
  cod_approved: 'admin.order.event.cod_approved',
  order_cancelled: 'admin.order.event.order_cancelled',
};

const ACTOR_KEYS: Record<string, TranslationKey> = {
  customer: 'admin.order.actor.customer',
  staff: 'admin.order.actor.staff',
  system: 'admin.order.actor.system',
};

/**
 * One order, in full, for the owner.
 *
 * The page is the operational record: what was ordered, for whom, at what price, what happened to it,
 * and what may be done now. The decision controls are the same guarded forms as the COD queue, so
 * there is one implementation of the approval and the rejection - not a second one that could drift.
 *
 * There is deliberately no "mark dispatched", "mark delivered" or "record cash" control: those are
 * operations the current state model does not define, and inventing them here would fabricate policy.
 */
export function AdminOrderDetailView({
  order,
  notice,
  csrfToken,
  canApprove,
  canCancel,
  canReadCustomers,
  canReadAudit,
  returnTo,
}: {
  order: AdminOrderDetailModel;
  notice: AdminOrderNotice | null;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  canReadCustomers: boolean;
  canReadAudit: boolean;
  /** Where "back" goes: the queue or the order list, with its filters preserved. */
  returnTo: { href: string; labelKey: TranslationKey };
}) {
  const { t, price, pick, locale } = useTranslation();
  const dateTime = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const waiting = order.codState === 'cod_pending_approval' && order.status === 'pending';
  const statusTone: PillTone =
    order.status === 'cancelled' ? 'danger' : order.status === 'pending' ? 'warning' : 'success';
  const noticeTone: NoticeTone = notice !== null && ERROR_NOTICES.includes(notice) ? 'error' : 'success';

  return (
    <>
      <PageHeader
        eyebrow={t('admin.order.eyebrow')}
        title={order.orderNumber}
        description={t('admin.cod.placedAt', { time: dateTime.format(new Date(order.placedAt)) })}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href={returnTo.href}>
            {t(returnTo.labelKey)}
          </Link>
        }
      />

      {notice !== null && <Notice tone={noticeTone}>{t(NOTICE_KEYS[notice])}</Notice>}

      <div className={styles.detailGrid}>
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.itemsTitle')}</h2>
              <p>{t('admin.order.itemsBody')}</p>
            </div>
          </div>
          <ul className={styles.recordList}>
            {order.items.map((item) => (
              <li className={styles.record} key={item.id}>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn}</span>
                  <span className={styles.recordMeta}>
                    <span className={styles.mono}>{item.sku}</span>
                    <span>
                      {price(item.unitPriceMinor)} × {item.quantity}
                    </span>
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <span className={styles.recordPrice}>{price(item.lineTotalMinor)}</span>
                </div>
              </li>
            ))}
          </ul>

          <dl className={styles.orderTotals}>
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{price(order.itemsSubtotalMinor)}</dd>
            </div>
            <div>
              <dt>{t('cart.delivery')}</dt>
              <dd>{order.contact.districtCode === null ? t('orders.deliveryPending') : price(order.shippingMinor)}</dd>
            </div>
            <div className={styles.orderTotalRow}>
              <dt>{t('admin.cod.total')}</dt>
              <dd className={styles.orderTotal}>{price(order.totalMinor)}</dd>
            </div>
          </dl>
          {order.contact.districtCode === null && <p className={styles.note}>{t('admin.order.legacyDeliveryNote')}</p>}

          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.deliveryTitle')}</h2>
              <p>{t('admin.order.deliveryBody')}</p>
            </div>
          </div>
          <div className={styles.panel}>
            <p className={styles.orderName}>{order.contact.recipientName}</p>
            <a className={styles.orderPhone} href={`tel:${order.contact.recipientPhone}`}>
              {order.contact.recipientPhone}
            </a>
            <p className={styles.orderAddress}>
              {order.contact.addressLine}
              {order.contact.districtCode === null ? '' : `, ${deliveryAreaName(order.contact.districtCode, locale)}`}
              , {order.contact.area}, {order.contact.city}
              {order.contact.postcode === null ? '' : ` ${order.contact.postcode}`}
            </p>
            {order.contact.deliveryNote !== null && (
              <p className={styles.note}>{t('admin.order.deliveryNote', { note: order.contact.deliveryNote })}</p>
            )}
          </div>

          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.historyTitle')}</h2>
              <p>{t('admin.order.historyBody')}</p>
            </div>
          </div>
          {order.events.length === 0 ? (
            <EmptyState title={t('admin.order.noHistoryTitle')} body={t('admin.order.noHistoryBody')} icon="clock" />
          ) : (
            <ul className={styles.dividerList}>
              {order.events.map((event) => (
                <li className={styles.dividerItem} key={event.id}>
                  <span className={styles.recordTitle}>
                    {EVENT_KEYS[event.eventType] === undefined ? (
                      <span className={styles.mono}>{event.eventType}</span>
                    ) : (
                      t(EVENT_KEYS[event.eventType] as TranslationKey)
                    )}{' '}
                    <span className={styles.tag}>{t(ACTOR_KEYS[event.actorType] ?? 'admin.order.actor.unknown')}</span>
                  </span>
                  <span className={styles.recordMeta}>
                    {dateTime.format(new Date(event.occurredAt))}
                    {event.toValue === null ? '' : ` · ${event.toValue}`}
                  </span>
                  {event.reason !== null && <span className={styles.recordMeta}>{event.reason}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.auditTitle')}</h2>
              <p>{t('admin.order.auditBody')}</p>
            </div>
          </div>
          {!canReadAudit || order.audit === null ? (
            <p className={styles.note}>{t('admin.order.auditPermission')}</p>
          ) : order.audit.length === 0 ? (
            <EmptyState title={t('admin.order.noAuditTitle')} body={t('admin.order.noAuditBody')} icon="audit" />
          ) : (
            <ul className={styles.dividerList}>
              {order.audit.map((entry) => (
                <li className={styles.dividerItem} key={entry.id}>
                  <span className={styles.recordTitle}>
                    <span className={styles.tag}>{entry.action}</span>{' '}
                    {entry.actorType === 'system' ? t('admin.audit.system') : `${t('admin.order.actor.staff')} #${entry.actorStaffId ?? '—'}`}
                  </span>
                  <span className={styles.recordMeta}>
                    {dateTime.format(new Date(entry.occurredAt))}
                    {entry.actorRoleCodes.length > 0 ? ` · ${entry.actorRoleCodes.join(', ')}` : ''}
                  </span>
                  {entry.reason !== null && <span className={styles.recordMeta}>{entry.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className={styles.section}>
          <div className={styles.panel}>
            <div className={styles.factGrid}>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('admin.order.status')}</span>
                <span>
                  <StatusPill tone={statusTone}>{t(statusLabel(order.status))}</StatusPill>
                </span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('admin.order.paymentState')}</span>
                <span className={styles.factValue}>
                  {t(paymentLabel(order.paymentMethod, order.paymentState, order.codState))}
                </span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('orders.method')}</span>
                <span className={styles.factValue}>{t(order.paymentMethod === 'cod' ? 'orders.method.cod' : 'orders.method.unknown')}</span>
              </div>
              {order.confirmedAt !== null && (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{t('admin.order.confirmedAt')}</span>
                  <span className={styles.factValue}>{dateTime.format(new Date(order.confirmedAt))}</span>
                </div>
              )}
              {order.cancelledAt !== null && (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{t('admin.order.cancelledAt')}</span>
                  <span className={styles.factValue}>{dateTime.format(new Date(order.cancelledAt))}</span>
                </div>
              )}
            </div>
            {order.cancelledReason !== null && (
              <p className={styles.note}>{t('admin.order.cancelledReason', { reason: order.cancelledReason })}</p>
            )}
            <p className={styles.note}>{t('admin.order.cashNote')}</p>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('admin.order.customerTitle')}</h2>
            {/*
              The order itself carries the delivery contact the owner needs to fulfil it. The *account*
              email is customer-profile data and requires `customer.read`, so it is shown only to a
              principal that holds it - reading an order is a different permission from reading a
              customer.
            */}
            <p className={styles.factValue}>{order.customer.displayName ?? t('admin.order.customerUnnamed')}</p>
            {canReadCustomers && order.customer.email !== null ? (
              <p className={styles.note}>{order.customer.email}</p>
            ) : (
              <p className={styles.note}>{t('admin.order.customerPermission')}</p>
            )}
            <div className={styles.factGrid}>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('admin.customers.status')}</span>
                <span>
                  <StatusPill tone={order.customer.status === 'active' ? 'success' : 'danger'}>
                    {order.customer.status === 'active'
                      ? t('admin.customers.active')
                      : t('admin.customers.suspended')}
                  </StatusPill>
                </span>
              </div>
            </div>
            {canReadCustomers && (
              <Link
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}
                href={`/admin/customers/${order.customer.id}`}
              >
                {t('admin.order.viewCustomer')}
              </Link>
            )}
          </div>

          {waiting && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{t('admin.order.decisionTitle')}</h2>
              <p className={styles.note}>{t('admin.order.decisionBody')}</p>
              <div className={styles.orderActions}>
                <form action="/api/admin/orders-cod" method="post" className={styles.approveForm}>
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="orderId" value={order.orderId} />
                  <input type="hidden" name="decision" value="approve" />
                  <details className={styles.noteDetails}>
                    <summary>{t('admin.cod.noteSummary')}</summary>
                    <label className="sr-only" htmlFor="order-approve-reason">
                      {t('admin.cod.approveReason')}
                    </label>
                    <input
                      id="order-approve-reason"
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
                    fields={{ orderId: order.orderId, decision: 'reject' }}
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
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
