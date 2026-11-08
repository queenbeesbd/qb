'use client';

import Link from 'next/link';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { orderDiscountMinor } from '@/lib/money';
import { ORDER_COST_PATH, ORDER_TRANSITION_PATH } from '@/server/auth/constants';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { EmptyState } from '../../../_ui/EmptyState';
import { Notice, type NoticeTone } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { StatusPill, type PillTone } from '../../../_ui/StatusPill';
import { SubmitButton } from '../../../_ui/SubmitButton';
import styles from '../../../qbpanel.module.css';
import { INTL_LOCALE } from '@/i18n/config';

export type AdminOrderNotice =
  | 'approved'
  | 'steadfastBooked'
  | 'steadfastExists'
  | 'steadfastFailed'
  | 'steadfastNotConfigured'
  | 'steadfastInProgress'
  | 'steadfastRefreshed'
  | 'steadfastMissing'
  | 'rejected'
  | 'dispatched'
  | 'delivered'
  | 'failed'
  | 'returned'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'inspected'
  | 'costRecorded'
  | 'costVoided'
  | 'costInvalid'
  | 'denied'
  | 'conflict'
  | 'invalid';

export type AdminOrderReturnModel = {
  id: number;
  orderItemId: number;
  sku: string;
  nameBn: string | null;
  nameEn: string;
  quantity: number;
  reason: string;
  state: string;
  requestedAt: string;
  receivedAt: string | null;
  inspectedAt: string | null;
  inspectionNote: string | null;
};

export type AdminOrderDetailModel = {
  /** Internal identity, needed only by the forms the server re-authorizes. */
  orderId: number;
  orderNumber: string;
  placedAt: string;
  /** Whole hours since placement, computed by the server so the render stays pure. */
  ageHours: number;
  status: string;
  paymentMethod: string;
  paymentState: string;
  codState: string;
  itemsSubtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  /**
   * `id` is null on a guest order (no account). `email` is also null when the viewer may not read
   * customer profiles; it is not sent at all.
   */
  customer: {
    id: number | null;
    email: string | null;
    displayName: string | null;
    status: string | null;
  };
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
    nameBn: string | null;
    nameEn: string;
    variantLabel: string | null;
    sku: string;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
  }[];
  returns: readonly AdminOrderReturnModel[];
  /** Additional courier costs, voided ones included, newest first. */
  costs: readonly {
    id: number;
    amountMinor: number;
    description: string;
    recordedAt: string;
    voidedAt: string | null;
    voidReason: string | null;
  }[];
  /**
   * The SteadFast consignment this order was sent to, or `null`. It is a mirror of what the courier
   * accepted - sending a parcel never changes the order's own state.
   */
  consignment: {
    invoice: string;
    consignmentId: number;
    trackingCode: string;
    status: string;
    codAmountMinor: number;
    createdAt: string;
    statusCheckedAt: string | null;
  } | null;
  /** Whether the courier account is usable, so the screen never offers a send that cannot work. */
  steadfast: { configured: boolean; enabled: boolean };
  /** The four money facts, kept separate: never collapsed into one "revenue" number. */
  money: {
    customerPaymentMinor: number;
    standardDeliveryFeeMinor: number;
    additionalCostsMinor: number;
    activeCostCount: number;
    estimatedNetProceedsMinor: number | null;
  };
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
  /** Only present when the principal holds audit.read. */
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
  steadfastBooked: 'admin.order.notice.steadfastBooked',
  steadfastExists: 'admin.order.notice.steadfastExists',
  steadfastFailed: 'admin.order.notice.steadfastFailed',
  steadfastNotConfigured: 'admin.order.notice.steadfastNotConfigured',
  steadfastInProgress: 'admin.order.notice.steadfastInProgress',
  steadfastRefreshed: 'admin.order.notice.steadfastRefreshed',
  steadfastMissing: 'admin.order.notice.steadfastMissing',
  rejected: 'admin.cod.notice.rejected',
  dispatched: 'admin.order.notice.dispatched',
  delivered: 'admin.order.notice.delivered',
  failed: 'admin.order.notice.failed',
  returned: 'admin.order.notice.returned',
  paid: 'admin.order.notice.paid',
  completed: 'admin.order.notice.completed',
  cancelled: 'admin.order.notice.cancelled',
  inspected: 'admin.order.notice.inspected',
  costRecorded: 'admin.order.notice.costRecorded',
  costVoided: 'admin.order.notice.costVoided',
  costInvalid: 'admin.order.notice.costInvalid',
  denied: 'admin.cod.notice.denied',
  conflict: 'admin.cod.notice.conflict',
  invalid: 'admin.cod.notice.invalid',
};

const ERROR_NOTICES: readonly AdminOrderNotice[] = [
  'denied',
  'conflict',
  'invalid',
  'costInvalid',
  'steadfastFailed',
];

/**
 * Event types this release can actually write, translated. Anything else is shown as its stored code:
 * a label the store cannot substantiate would be a claim, and the code is the honest fact.
 */
const EVENT_KEYS: Record<string, TranslationKey> = {
  order_placed: 'admin.order.event.order_placed',
  cod_approved: 'admin.order.event.cod_approved',
  order_shipped: 'admin.order.event.order_shipped',
  order_delivered: 'admin.order.event.order_delivered',
  cod_failed: 'admin.order.event.cod_failed',
  return_received: 'admin.order.event.return_received',
  return_inspected: 'admin.order.event.return_inspected',
  cod_collected: 'admin.order.event.cod_collected',
  order_completed: 'admin.order.event.order_completed',
  order_cancelled: 'admin.order.event.order_cancelled',
  order_claimed: 'admin.order.event.order_claimed',
};

const ACTOR_KEYS: Record<string, TranslationKey> = {
  customer: 'admin.order.actor.customer',
  staff: 'admin.order.actor.staff',
  system: 'admin.order.actor.system',
};

/** Return states, translated. An unknown state falls back to its stored code. */
const RETURN_STATE_KEYS: Record<string, TranslationKey> = {
  requested: 'admin.order.return.requested',
  approved: 'admin.order.return.approved',
  in_transit: 'admin.order.return.in_transit',
  received: 'admin.order.return.received',
  inspected_accepted: 'admin.order.return.inspected_accepted',
  inspected_rejected: 'admin.order.return.inspected_rejected',
  closed: 'admin.order.return.closed',
};

function returnTone(state: string): PillTone {
  if (state === 'inspected_rejected') return 'danger';
  if (state === 'inspected_accepted') return 'success';
  if (state === 'received') return 'warning';
  return 'info';
}

const STATUS_TONES: Record<string, PillTone> = {
  cancelled: 'danger',
  returned: 'danger',
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  shipped: 'info',
  delivered: 'success',
  completed: 'success',
};

/**
 * One order, in full, for the owner - the operational workspace.
 *
 * The page is the record: what was ordered, for whom, at what price, what happened to it, and what may
 * be done now. Every action it offers is a state the model actually defines, posts to the one guarded
 * transition endpoint, and is re-authorized in the service by the permission that action needs - so a
 * control is never the control.
 *
 * Two things are deliberately absent. **No reconciliation control**: the owner has not defined what
 * matching a courier statement means, so cod_reconciled is unreachable. **No stock control**: a returned
 * parcel is inspected and its finding recorded, but making the product orderable again is a separate,
 * deliberate act on the product screen (ADR 0013).
 */
export function AdminOrderDetailView({
  order,
  notice,
  csrfToken,
  canApprove,
  canCancel,
  canFulfil,
  canCollect,
  canInspect,
  canRecordCosts,
  canReadCustomers,
  canReadAudit,
  returnTo,
}: {
  order: AdminOrderDetailModel;
  notice: AdminOrderNotice | null;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  canFulfil: boolean;
  canCollect: boolean;
  canInspect: boolean;
  /** `order.cost_record`: recording and voiding additional courier costs. */
  canRecordCosts: boolean;
  canReadCustomers: boolean;
  canReadAudit: boolean;
  /** Where "back" goes: the queue or the order list, with its filters preserved. */
  returnTo: { href: string; labelKey: TranslationKey };
}) {
  const { t, price, pick } = useTranslation();
  const dateTime = new Intl.DateTimeFormat(INTL_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const waiting = order.codState === 'cod_pending_approval' && order.status === 'pending';
  const statusTone = STATUS_TONES[order.status] ?? 'neutral';
  const noticeTone: NoticeTone = notice !== null && ERROR_NOTICES.includes(notice) ? 'error' : 'success';

  // The same eligibility rules the service guards on, so a control appears exactly when the write
  // would succeed. Presentation only: the scope that matters is the WHERE clause in the service.
  const approvedForDispatch =
    (order.paymentMethod === 'cod' && order.codState === 'cod_approved') ||
    (order.paymentMethod !== 'cod' && order.paymentState === 'verified');
  const dispatchable = approvedForDispatch && (order.status === 'confirmed' || order.status === 'processing');
  const awaitingDeliveryOutcome = order.status === 'shipped' && order.codState === 'cod_approved';
  const returnAwaitingReceipt =
    order.status === 'shipped' &&
    order.codState === 'cod_failed' &&
    order.returns.some((entry) => entry.state === 'requested' || entry.state === 'approved' || entry.state === 'in_transit');
  // Payment is received once the parcel is out or has arrived: before that there is no money to
  // confirm, and after it the order is already complete.
  const receivable =
    order.codState === 'cod_approved' && (order.status === 'shipped' || order.status === 'delivered');
  const completable =
    order.status === 'delivered' && (order.codState === 'cod_collected' || order.codState === 'cod_failed');
  const cancellable = order.status === 'pending' || order.status === 'confirmed' || order.status === 'processing';
  // The same eligibility the booking service guards on: a confirmed COD order that has not been
  // dispatched yet. The panel is shown for that order, or for any order that already has a parcel.
  const sendable =
    order.paymentMethod === 'cod' &&
    order.codState === 'cod_approved' &&
    (order.status === 'confirmed' || order.status === 'processing');
  const courierReady = order.steadfast.configured && order.steadfast.enabled;

  const ageText = ((): string => {
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return order.ageHours >= 24
      ? format.format(-Math.floor(order.ageHours / 24), 'day')
      : format.format(-order.ageHours, 'hour');
  })();

  /*
    A permission is not an action. The band renders only when the current state actually has a step
    to take, so a settled order shows no band rather than an empty "Next step" panel promising work
    that does not exist.
  */
  const hasOperations =
    dispatchable ||
    awaitingDeliveryOutcome ||
    receivable ||
    returnAwaitingReceipt ||
    completable ||
    (cancellable && canCancel);

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={t('admin.cod.placedAt', { time: dateTime.format(new Date(order.placedAt)) })}
        actions={
          <>
            <Link
              className={[styles.button, styles.buttonSecondary].join(' ')}
              href={'/qbpanel/orders/' + order.orderNumber + '/slip'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('admin.order.printSlip')}
            </Link>
            <Link className={[styles.button, styles.buttonSecondary].join(' ')} href={returnTo.href}>
              {t(returnTo.labelKey)}
            </Link>
          </>
        }
      />

      {notice !== null && <Notice tone={noticeTone}>{t(NOTICE_KEYS[notice])}</Notice>}

      {/*
        The next legal action comes before the record, not after it. The owner opens an order to
        decide or advance it; every fact below is what they check before pressing one of these.
      */}
      {(waiting || hasOperations) && (
        <OrderActionBand
          order={order}
          csrfToken={csrfToken}
          waiting={waiting}
          dispatchable={dispatchable}
          awaitingDeliveryOutcome={awaitingDeliveryOutcome}
          receivable={receivable}
          returnAwaitingReceipt={returnAwaitingReceipt}
          completable={completable}
          cancellable={cancellable}
          canApprove={canApprove}
          canCancel={canCancel}
          canFulfil={canFulfil}
          canCollect={canCollect}
          canInspect={canInspect}
          canRecordCosts={canRecordCosts}
        />
      )}

      {/*
        The courier record. A parcel is not a state of the order: this panel states what SteadFast
        accepted and when its status was last read, and nothing here advances the order by itself.
      */}
      {(order.consignment !== null || sendable) && (
        <section className={styles.section} aria-labelledby="order-steadfast">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="order-steadfast">{t('admin.order.steadfast.title')}</h2>
              <p>{t('admin.order.steadfast.body')}</p>
            </div>
            {order.consignment !== null && (
              <form action="/api/qbpanel/orders/consignment" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="operation" value="refresh" />
                <input type="hidden" name="orderNumber" value={order.orderNumber} />
                <SubmitButton
                  label={t('admin.order.steadfast.refresh')}
                  pendingLabel={t('admin.common.working')}
                  variant="secondary"
                />
              </form>
            )}
          </div>

          {order.consignment === null ? (
            <>
              <p className={styles.note}>
                {courierReady
                  ? t('admin.order.steadfast.notSent')
                  : t('admin.order.steadfast.notConfigured')}
              </p>
              <div className={styles.settingActions}>
                {courierReady && canApprove && (
                  <form action="/api/qbpanel/orders/consignment" method="post">
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="operation" value="send" />
                    <input type="hidden" name="orderNumber" value={order.orderNumber} />
                    <SubmitButton
                      label={t('admin.order.steadfast.send')}
                      pendingLabel={t('admin.common.working')}
                    />
                  </form>
                )}
                {!courierReady && (
                  <Link className={styles.recordLink} href="/qbpanel/settings/integrations/steadfast">
                    {t('admin.order.steadfast.openSettings')}
                  </Link>
                )}
              </div>
            </>
          ) : (
            <>
              <dl className={styles.moneyGrid}>
                <div className={styles.moneyItem}>
                  <dt className={styles.factLabel}>{t('admin.order.steadfast.invoice')}</dt>
                  <dd className={styles.mono}>{order.consignment.invoice}</dd>
                </div>
                <div className={styles.moneyItem}>
                  <dt className={styles.factLabel}>{t('admin.order.steadfast.consignmentId')}</dt>
                  <dd className={styles.mono}>{order.consignment.consignmentId}</dd>
                </div>
                <div className={styles.moneyItem}>
                  <dt className={styles.factLabel}>{t('admin.order.steadfast.trackingCode')}</dt>
                  <dd className={styles.mono}>{order.consignment.trackingCode}</dd>
                </div>
                <div className={styles.moneyItem}>
                  <dt className={styles.factLabel}>{t('admin.order.steadfast.status')}</dt>
                  <dd className={styles.mono}>{order.consignment.status}</dd>
                </div>
                <div className={styles.moneyItem}>
                  <dt className={styles.factLabel}>{t('admin.order.steadfast.codAmount')}</dt>
                  <dd className={styles.recordPrice}>{price(order.consignment.codAmountMinor)}</dd>
                </div>
                <div className={styles.moneyItem}>
                  <dt className={styles.factLabel}>{t('admin.order.steadfast.bookedAt')}</dt>
                  <dd>{dateTime.format(new Date(order.consignment.createdAt))}</dd>
                </div>
              </dl>
              <p className={styles.note}>
                {order.consignment.statusCheckedAt === null
                  ? t('admin.order.steadfast.neverChecked')
                  : t('admin.order.steadfast.checkedAt', {
                      time: dateTime.format(new Date(order.consignment.statusCheckedAt)),
                    })}
              </p>
            </>
          )}
        </section>
      )}

      {/*
        The money facts, kept separate on purpose. The customer's payment is gross; the standard
        delivery fee inside it is what the courier keeps; additional costs are the shop's own; and the
        net figure is an estimate, labelled as one, or "unavailable" when the order cannot substantiate
        the split.
      */}
      <div className={styles.detailGrid}>
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.moneyTitle')}</h2>
            </div>
          </div>
          <dl className={styles.moneyGrid}>
            <div className={styles.moneyItem}>
              <dt className={styles.factLabel}>{t('admin.order.moneyCustomerPayment')}</dt>
              <dd className={styles.recordPrice}>{price(order.money.customerPaymentMinor)}</dd>
            </div>
            <div className={styles.moneyItem}>
              <dt className={styles.factLabel}>{t('admin.order.moneyStandardFee')}</dt>
              <dd className={styles.recordPrice}>{price(order.money.standardDeliveryFeeMinor)}</dd>
            </div>
            <div className={styles.moneyItem}>
              <dt className={styles.factLabel}>{t('admin.order.moneyAdditionalCosts')}</dt>
              <dd className={styles.recordPrice}>{price(order.money.additionalCostsMinor)}</dd>
            </div>
            <div className={styles.moneyItem}>
              <dt className={styles.factLabel}>{t('admin.order.moneyNetEstimate')}</dt>
              <dd className={styles.recordPrice}>
                {order.money.estimatedNetProceedsMinor === null
                  ? t('admin.order.moneyUnavailable')
                  : price(order.money.estimatedNetProceedsMinor)}
              </dd>
            </div>
          </dl>
          {order.money.estimatedNetProceedsMinor === null && (
            <p className={styles.note}>{t('admin.order.moneyUnsubstantiated')}</p>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.costsTitle')}</h2>
              <p>{t('admin.order.costsBody')}</p>
            </div>
          </div>
          {order.costs.length === 0 ? (
            <p className={styles.note}>{t('admin.order.costsEmpty')}</p>
          ) : (
            <ul className={styles.recordList}>
              {order.costs.map((cost) => (
                <li className={styles.record} key={cost.id}>
                  <div className={styles.recordMain}>
                    <span className={styles.recordTitle}>{cost.description}</span>
                    <span className={styles.recordMeta}>
                      <span>{dateTime.format(new Date(cost.recordedAt))}</span>
                      {cost.voidedAt !== null && (
                        <span>
                          {t('admin.order.costVoided', { reason: cost.voidReason ?? '' })}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={styles.recordSide}>
                    <span
                      className={
                        cost.voidedAt === null ? styles.recordPrice : `${styles.recordPrice} ${styles.recordVoided}`
                      }
                    >
                      {price(cost.amountMinor)}
                    </span>
                    {cost.voidedAt === null && canRecordCosts && (
                      <form action={ORDER_COST_PATH} method="post" className={styles.costVoidForm}>
                        <input type="hidden" name="csrf" value={csrfToken} />
                        <input type="hidden" name="operation" value="void" />
                        <input type="hidden" name="orderId" value={order.orderId} />
                        <input type="hidden" name="costId" value={cost.id} />
                        <details className={styles.noteDetails}>
                          <summary>{t('admin.order.costVoid')}</summary>
                          <label className="sr-only" htmlFor={`void-reason-${cost.id}`}>
                            {t('admin.order.costVoidReason')}
                          </label>
                          <input
                            id={`void-reason-${cost.id}`}
                            name="reason"
                            className={styles.input}
                            maxLength={200}
                          />
                          <SubmitButton
                            label={t('admin.order.costVoidConfirm')}
                            pendingLabel={t('admin.common.working')}
                            variant="secondary"
                          />
                        </details>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
                      {price(item.unitPriceMinor)} x {item.quantity}
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
            {orderDiscountMinor(order.itemsSubtotalMinor, order.shippingMinor, order.totalMinor) > 0 && (
              <div>
                <dt>{t('orders.discount')}</dt>
                <dd>
                  −{price(orderDiscountMinor(order.itemsSubtotalMinor, order.shippingMinor, order.totalMinor))}
                </dd>
              </div>
            )}
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

          {order.returns.length > 0 && (
            <>
              <div className={styles.sectionHead}>
                <div>
                  <h2>{t('admin.order.returnsTitle')}</h2>
                  <p>{t('admin.order.returnsBody')}</p>
                </div>
              </div>
              <ul className={styles.recordList}>
                {order.returns.map((entry) => (
                  <li className={styles.record} key={entry.id}>
                    <div className={styles.recordMain}>
                      <span className={styles.recordTitle}>
                        {pick({ bn: entry.nameBn, en: entry.nameEn }) ?? entry.nameEn}
                      </span>
                      <span className={styles.recordMeta}>
                        <span className={styles.mono}>{entry.sku}</span>
                        <span>
                          {t('admin.order.returnQuantity', { count: entry.quantity })}
                        </span>
                        <StatusPill tone={returnTone(entry.state)}>
                          {RETURN_STATE_KEYS[entry.state] === undefined
                            ? entry.state
                            : t(RETURN_STATE_KEYS[entry.state] as TranslationKey)}
                        </StatusPill>
                      </span>
                      {entry.receivedAt !== null && (
                        <span className={styles.recordMeta}>
                          {t('admin.order.returnReceivedAt', { time: dateTime.format(new Date(entry.receivedAt)) })}
                        </span>
                      )}
                      {entry.inspectedAt !== null && (
                        <span className={styles.recordMeta}>
                          {t('admin.order.returnInspectedAt', { time: dateTime.format(new Date(entry.inspectedAt)) })}
                        </span>
                      )}
                      {entry.inspectionNote !== null && (
                        <span className={styles.recordMeta}>{t('admin.order.returnNote', { note: entry.inspectionNote })}</span>
                      )}

                      {entry.state === 'received' && (
                        <div className={styles.orderActions}>
                          <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                            <input type="hidden" name="csrf" value={csrfToken} />
                            <input type="hidden" name="action" value="inspect_accepted" />
                            <input type="hidden" name="returnId" value={entry.id} />
                            <details className={styles.noteDetails}>
                              <summary>{t('admin.order.inspectAcceptedSummary')}</summary>
                              <label className="sr-only" htmlFor={'accept-note-' + entry.id}>
                                {t('admin.order.inspectAcceptedNote')}
                              </label>
                              <textarea
                                id={'accept-note-' + entry.id}
                                name="note"
                                className={styles.textarea}
                                rows={2}
                                maxLength={300}
                              />
                            </details>
                            <SubmitButton
                              label={t('admin.order.inspectAccepted')}
                              pendingLabel={t('admin.common.working')}
                              variant="secondary"
                              small
                              disabled={!canInspect}
                            />
                          </form>
                          {canInspect ? (
                            <ConfirmSubmit
                              action={ORDER_TRANSITION_PATH}
                              csrfToken={csrfToken}
                              fields={{ returnId: entry.id, action: 'inspect_rejected' }}
                              triggerLabel={t('admin.order.inspectRejected')}
                              title={t('admin.order.inspectRejectedTitle')}
                              body={t('admin.order.inspectRejectedBody')}
                              confirmLabel={t('admin.order.inspectRejectedConfirm')}
                              cancelLabel={t('admin.common.cancel')}
                              pendingLabel={t('admin.common.working')}
                              reason={{
                                label: t('admin.order.inspectRejectedNote'),
                                placeholder: t('admin.order.inspectRejectedPlaceholder'),
                                minLength: 3,
                                maxLength: 300,
                                required: true,
                              }}
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className={styles.note}>{t('admin.order.returnsStockNote')}</p>
            </>
          )}

          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.deliveryTitle')}</h2>
              <p>{t('admin.order.deliveryBody')}</p>
            </div>
          </div>
          <div className={styles.panel}>
            <p className={styles.orderName}>{order.contact.recipientName}</p>
            <a className={styles.orderPhone} href={'tel:' + order.contact.recipientPhone}>
              {order.contact.recipientPhone}
            </a>
            <p className={styles.orderAddress}>
              {order.contact.addressLine}
              {order.contact.districtCode === null
                ? ''
                : ', ' + deliveryAreaName(order.contact.districtCode)}
              , {order.contact.area}, {order.contact.city}
              {order.contact.postcode === null ? '' : ' ' + order.contact.postcode}
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
                    {event.toValue === null ? '' : ' - ' + event.toValue}
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
                    {entry.actorType === 'system'
                      ? t('admin.audit.system')
                      : t('admin.order.actor.staff') + ' #' + (entry.actorStaffId ?? '-')}
                  </span>
                  <span className={styles.recordMeta}>
                    {dateTime.format(new Date(entry.occurredAt))}
                    {entry.actorRoleCodes.length > 0 ? ' - ' + entry.actorRoleCodes.join(', ') : ''}
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
                <span className={styles.factValue}>
                  {t(order.paymentMethod === 'cod' ? 'orders.method.cod' : 'orders.method.unknown')}
                </span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('admin.order.age')}</span>
                <span className={styles.factValue}>{ageText}</span>
              </div>
              {order.confirmedAt !== null && (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{t('admin.order.confirmedAt')}</span>
                  <span className={styles.factValue}>{dateTime.format(new Date(order.confirmedAt))}</span>
                </div>
              )}
              {order.shippedAt !== null && (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{t('admin.order.shippedAt')}</span>
                  <span className={styles.factValue}>{dateTime.format(new Date(order.shippedAt))}</span>
                </div>
              )}
              {order.deliveredAt !== null && (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{t('admin.order.deliveredAt')}</span>
                  <span className={styles.factValue}>{dateTime.format(new Date(order.deliveredAt))}</span>
                </div>
              )}
              {order.completedAt !== null && (
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{t('admin.order.completedAt')}</span>
                  <span className={styles.factValue}>{dateTime.format(new Date(order.completedAt))}</span>
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
            <p className={styles.note}>{t('admin.order.reconcileNote')}</p>
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('admin.order.customerTitle')}</h2>
            {order.customer.id === null ? (
              <>
                <p className={styles.factValue}>{t('admin.order.guestCustomer')}</p>
                <p className={styles.note}>{t('admin.order.guestCustomerNote')}</p>
              </>
            ) : (
              <>
                <p className={styles.factValue}>
                  {order.customer.displayName ?? t('admin.order.customerUnnamed')}
                </p>
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
                    className={styles.button + ' ' + styles.buttonSecondary + ' ' + styles.buttonSmall}
                    href={'/qbpanel/customers/' + order.customer.id}
                  >
                    {t('admin.order.viewCustomer')}
                  </Link>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * The order's next legal action, mounted directly under the page header.
 *
 * The owner opens an order to act on it: decide it, dispatch it, record the cash. The record below is
 * what they check before acting, so it reads second. Two rules keep this honest:
 *
 * - **Only a legal step is offered.** Every form is the same guarded route the rest of the admin uses,
 *   and the service re-checks the order's state and the actor's permission. This band is presentation.
 * - **No empty panel.** The parent renders it only when `waiting || hasOperations`, and
 *   `hasOperations` is derived from the transitions that actually render, not from permissions - a
 *   settled order has nothing to do and says so by showing no band at all.
 *
 * Return inspection keeps its controls beside the returned line in the record: inspecting one line
 * belongs to that line, not to the order as a whole.
 */
type OrderActionBandProps = {
  order: AdminOrderDetailModel;
  csrfToken: string;
  waiting: boolean;
  dispatchable: boolean;
  awaitingDeliveryOutcome: boolean;
  receivable: boolean;
  returnAwaitingReceipt: boolean;
  completable: boolean;
  cancellable: boolean;
  canApprove: boolean;
  canCancel: boolean;
  canFulfil: boolean;
  canCollect: boolean;
  canInspect: boolean;
  canRecordCosts: boolean;
};

function OrderActionBand({
  order,
  csrfToken,
  waiting,
  dispatchable,
  awaitingDeliveryOutcome,
  receivable,
  returnAwaitingReceipt,
  completable,
  cancellable,
  canApprove,
  canCancel,
  canFulfil,
  canCollect,
  canInspect,
  canRecordCosts,
}: OrderActionBandProps) {
  const { t, price } = useTranslation();

  return (
    <section className={styles.actionBand} aria-labelledby="order-action-title">
      <div className={styles.actionBandHead}>
        <div>
          <h2 className={styles.actionBandTitle} id="order-action-title">
            {waiting ? t('admin.order.decisionTitle') : t('admin.order.operationsTitle')}
          </h2>
          <p className={styles.actionBandBody}>
            {waiting ? t('admin.order.decisionBody') : t('admin.order.operationsBody')}
          </p>
        </div>
        <div className={styles.actionBandTotal}>
          <span className={styles.factLabel}>{t('admin.cod.total')}</span>
          <span className={styles.recordPrice}>{price(order.totalMinor)}</span>
        </div>
      </div>

      <div className={styles.actionGrid}>
        {waiting ? (
          <>
            <form
              action="/api/qbpanel/orders-cod"
              method="post"
              className={styles.approveForm + ' ' + styles.actionFormPrimary}
            >
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="orderId" value={order.orderId} />
              <input type="hidden" name="decision" value="approve" />
              {/* Open by default: the note is required, and a collapsed required field is a trap. */}
              <details className={styles.noteDetails} open>
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
                action="/api/qbpanel/orders-cod"
                csrfToken={csrfToken}
                fields={{ orderId: order.orderId, decision: 'reject' }}
                triggerLabel={t('admin.cod.reject')}
                triggerVariant="dangerOutline"
                title={t('admin.cod.rejectTitle')}
                body={t('admin.cod.rejectBody')}
                confirmLabel={t('admin.cod.rejectConfirm')}
                cancelLabel={t('admin.common.cancel')}
                pendingLabel={t('admin.common.working')}
                className={styles.approveForm + ' ' + styles.actionConfirmEnd}
                reason={{
                  label: t('admin.cod.rejectReason'),
                  placeholder: t('admin.cod.rejectReasonPlaceholder'),
                  minLength: 10,
                  maxLength: 500,
                  required: true,
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            {dispatchable && (
              <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="dispatch" />
                <input type="hidden" name="orderId" value={order.orderId} />
                <details className={styles.noteDetails}>
                  <summary>{t('admin.order.noteSummary')}</summary>
                  <label className="sr-only" htmlFor="dispatch-note">
                    {t('admin.order.dispatchNote')}
                  </label>
                  <input id="dispatch-note" name="note" className={styles.input} maxLength={300} />
                </details>
                <SubmitButton
                  label={t('admin.order.dispatch')}
                  pendingLabel={t('admin.common.working')}
                  disabled={!canFulfil}
                  wide
                />
              </form>
            )}

            {awaitingDeliveryOutcome && (
              <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="delivered" />
                <input type="hidden" name="orderId" value={order.orderId} />
                <details className={styles.noteDetails}>
                  <summary>{t('admin.order.noteSummary')}</summary>
                  <label className="sr-only" htmlFor="delivered-note">
                    {t('admin.order.deliveredNote')}
                  </label>
                  <input id="delivered-note" name="note" className={styles.input} maxLength={300} />
                </details>
                <SubmitButton
                  label={t('admin.order.delivered')}
                  pendingLabel={t('admin.common.working')}
                  variant="secondary"
                  disabled={!canFulfil}
                  wide
                />
              </form>
            )}

            {receivable && (
              <form
                action={ORDER_TRANSITION_PATH}
                method="post"
                className={styles.approveForm + ' ' + styles.actionFormWide}
              >
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="paid" />
                <input type="hidden" name="orderId" value={order.orderId} />
                <p className={styles.note}>{t('admin.order.paidBody')}</p>
                <details className={styles.noteDetails}>
                  <summary>{t('admin.order.noteSummary')}</summary>
                  <label className="sr-only" htmlFor="collect-note">
                    {t('admin.order.paidNote')}
                  </label>
                  <input id="collect-note" name="note" className={styles.input} maxLength={300} />
                </details>

                {/*
                  Additional costs are recorded with the receipt, in the same submission and the same
                  transaction. Two blank rows are offered rather than one required row: no cost is a
                  perfectly normal answer, and the owner is never made to invent one to complete.
                */}
                {canRecordCosts && (
                  <fieldset className={styles.costEntry}>
                    <legend className={styles.costLegend}>{t('admin.order.costsEntryTitle')}</legend>
                    <p className={styles.note}>{t('admin.order.costsEntryBody')}</p>
                    {[0, 1].map((index) => (
                      <div key={index} className={styles.costRow}>
                        <label className="sr-only" htmlFor={`cost-amount-${index}`}>
                          {t('admin.order.costsEntryAmount')}
                        </label>
                        <input
                          id={`cost-amount-${index}`}
                          name="costAmount"
                          className={styles.input}
                          inputMode="decimal"
                          placeholder={t('admin.order.costsEntryAmount')}
                        />
                        <label className="sr-only" htmlFor={`cost-description-${index}`}>
                          {t('admin.order.costsEntryDescription')}
                        </label>
                        <input
                          id={`cost-description-${index}`}
                          name="costDescription"
                          className={styles.input}
                          maxLength={200}
                          placeholder={t('admin.order.costsEntryDescription')}
                        />
                      </div>
                    ))}
                  </fieldset>
                )}

                <SubmitButton
                  label={t('admin.order.paid')}
                  pendingLabel={t('admin.common.working')}
                  disabled={!canCollect}
                  wide
                />
              </form>
            )}

            {returnAwaitingReceipt && (
              <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="return_received" />
                <input type="hidden" name="orderId" value={order.orderId} />
                <details className={styles.noteDetails}>
                  <summary>{t('admin.order.noteSummary')}</summary>
                  <label className="sr-only" htmlFor="return-note">
                    {t('admin.order.returnReceivedNote')}
                  </label>
                  <input id="return-note" name="note" className={styles.input} maxLength={300} />
                </details>
                <SubmitButton
                  label={t('admin.order.returnReceived')}
                  pendingLabel={t('admin.common.working')}
                  disabled={!canInspect}
                  wide
                />
              </form>
            )}

            {completable && (
              <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="complete" />
                <input type="hidden" name="orderId" value={order.orderId} />
                <SubmitButton
                  label={t('admin.order.complete')}
                  pendingLabel={t('admin.common.working')}
                  variant="secondary"
                  disabled={!canFulfil}
                  wide
                />
              </form>
            )}

            {awaitingDeliveryOutcome && canFulfil ? (
              <ConfirmSubmit
                action={ORDER_TRANSITION_PATH}
                csrfToken={csrfToken}
                fields={{ orderId: order.orderId, action: 'failed' }}
                triggerLabel={t('admin.order.failed')}
                title={t('admin.order.failedTitle')}
                body={t('admin.order.failedBody')}
                confirmLabel={t('admin.order.failedConfirm')}
                cancelLabel={t('admin.common.cancel')}
                pendingLabel={t('admin.common.working')}
                className={styles.approveForm + ' ' + styles.actionConfirmEnd}
                reason={{
                  label: t('admin.order.failedReason'),
                  placeholder: t('admin.order.failedReasonPlaceholder'),
                  minLength: 10,
                  maxLength: 500,
                  required: true,
                }}
              />
            ) : null}

            {cancellable && canCancel ? (
              <ConfirmSubmit
                action={ORDER_TRANSITION_PATH}
                csrfToken={csrfToken}
                fields={{ orderId: order.orderId, action: 'cancel' }}
                triggerLabel={t('admin.order.cancel')}
                title={t('admin.order.cancelTitle')}
                body={t('admin.order.cancelBody')}
                confirmLabel={t('admin.order.cancelConfirm')}
                cancelLabel={t('admin.common.cancel')}
                pendingLabel={t('admin.common.working')}
                /*
                 * The destructive partner ends on the same line as the primary action beside it.
                 * Without this it sat at the top of the grid row, level with the note field, while
                 * "Mark dispatched" sat below the field - the buttons read as two unrelated rows.
                 */
                className={styles.approveForm + ' ' + styles.actionConfirmEnd}
                reason={{
                  label: t('admin.order.cancelReason'),
                  placeholder: t('admin.order.cancelReasonPlaceholder'),
                  minLength: 10,
                  maxLength: 500,
                  required: true,
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

