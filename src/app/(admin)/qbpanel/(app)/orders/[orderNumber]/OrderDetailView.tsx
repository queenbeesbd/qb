'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';

import type { TranslationKey } from '@/i18n/dictionaries';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAddressText } from '@/lib/delivery-address';
import { orderDiscountMinor } from '@/lib/money';
import { ORDER_COST_PATH, ORDER_PROOF_REVIEW_PATH, ORDER_TRANSITION_PATH } from '@/server/auth/constants';
import { orderStatus } from '../../../_ui/order-status';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { EmptyState } from '../../../_ui/EmptyState';
import { AdminIcon } from '../../../_ui/icons';
import { ItemPhoto } from '../../../_ui/ItemPhoto';
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
  | 'proofReviewed'
  | 'proofInvalid'
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
    /**
     * The key of the photograph the order recorded when it was placed, or `null` for a line that
     * stored none. It is the snapshot, never the product's current image: the owner is looking at
     * what the customer bought.
     */
    imageKey: string | null;
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
   * The customer's optional payment screenshot, or `null` (ADR 0042). It states that an image arrived
   * and what the owner decided about it; it is not a payment state, and the order has none to set.
   */
  paymentProof: {
    uploadedAt: string;
    uploadedBy: string;
    reviewState: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    width: number;
    height: number;
  } | null;
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
  proofReviewed: 'admin.order.notice.proofReviewed',
  proofInvalid: 'admin.order.notice.proofInvalid',
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


type StageState = 'done' | 'current' | 'future';

type OrderStage = {
  readonly key: TranslationKey;
  /** The stored timestamp for this stage, or `null` when the record holds none. */
  readonly at: string | null;
  readonly state: StageState;
};

/**
 * The four movement stages, read from the timestamps and the fulfilment status.
 *
 * The track claims nothing the row does not hold: a stage is reached because its own timestamp exists,
 * or because a later stored state cannot be true without it - a dispatched parcel was confirmed, a
 * delivered one was shipped. The status is only a fallback for a row whose timestamp column is empty.
 *
 * **`completed` is not a delivery.** Cash is often collected while the parcel is still with the
 * courier, which completes the order without a recorded delivery; the last stage therefore rests on
 * `delivered_at` (or the delivered status), never on `completed`. A cancelled order stops where it
 * stopped and a returned parcel is not a delivery, so neither draws a "current" step: both are closed.
 */
function orderStages(order: AdminOrderDetailModel): {
  readonly stages: readonly OrderStage[];
  readonly terminal: boolean;
} {
  const delivered = order.deliveredAt !== null || order.status === 'delivered';
  const shipped = order.shippedAt !== null || delivered || order.status === 'shipped';
  const confirmed =
    order.confirmedAt !== null ||
    shipped ||
    order.status === 'confirmed' ||
    order.status === 'processing';
  const reached = [true, confirmed, shipped, delivered];
  const highest = delivered ? 3 : shipped ? 2 : confirmed ? 1 : 0;
  // Cancelled and returned orders are closed: their reached stages are history, not a position.
  const terminal = order.status === 'cancelled' || order.status === 'returned';
  // A completed order has no next movement stage either, so none of its marks is "current".
  const settled = terminal || order.status === 'completed';

  const definitions: readonly { key: TranslationKey; at: string | null }[] = [
    { key: 'account.step.placed', at: order.placedAt },
    { key: 'account.step.confirmed', at: order.confirmedAt },
    { key: 'orders.status.shipped', at: order.shippedAt },
    { key: 'account.step.delivered', at: order.deliveredAt },
  ];

  return {
    terminal,
    stages: definitions.map((definition, index) => ({
      ...definition,
      state: !reached[index] ? 'future' : settled || index < highest ? 'done' : 'current',
    })),
  };
}

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
  canReviewProof,
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
  /** `payment.proof_review`: deciding whether a payment screenshot agrees with the statement. */
  canReviewProof: boolean;
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
  const stageDate = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium' });

  const waiting = order.codState === 'cod_pending_approval' && order.status === 'pending';
  /*
    One status for the whole page, from the shared helper: the lifecycle state, with a failed delivery
    promoted to the pill because `status` is still `shipped` when the parcel comes back.
  */
  const status = orderStatus(order);
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

  const progress = orderStages(order);

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
        Where the parcel is, as four marks. Every reached stage is backed by a stored timestamp or a
        stored status that could not be true without it; a stage with no recorded date shows the
        label alone rather than a date nobody wrote.
      */}
      <section
        className={`${styles.section} ${styles.panel}`}
        aria-labelledby="order-progress"
        data-order-progress=""
      >
        <div className={styles.sectionHead}>
          <div>
            <h2 id="order-progress">{t('account.track.label')}</h2>
          </div>
          {/*
            One status, and the COD exception folded in (owner direction, 2026-11-20). A failed delivery
            leaves `status` at `shipped`, so this pill says "Delivery failed" rather than "Shipped" -
            and because it now says that, the separate note under the track has nothing left to add.
          */}
          <StatusPill tone={status.tone}>{t(status.label)}</StatusPill>
        </div>
        <ol className={styles.progressTrack} data-state={progress.terminal ? 'closed' : undefined}>
          {progress.stages.map((stage) => (
            <li
              className={styles.progressStep}
              key={stage.key}
              data-state={stage.state}
              aria-current={stage.state === 'current' ? 'step' : undefined}
            >
              <span className={styles.progressMark} aria-hidden="true">
                {stage.state === 'done' ? (
                  <AdminIcon name="check" width={13} height={13} />
                ) : (
                  <span className={styles.progressDot} />
                )}
              </span>
              <span className={styles.progressLabel}>{t(stage.key)}</span>
              <span className={styles.progressWhen}>
                {stage.at === null ? '' : stageDate.format(new Date(stage.at))}
              </span>
            </li>
          ))}
        </ol>
        {/*
          The facts the track cannot state, on one line rather than in a second panel of their own.
          Status is the pill in the head; confirmed, dispatched and delivered are the track's own
          dates; what is left is how it is being paid, which method, how old it is, and the two
          terminal timestamps the four stages do not carry.
        */}
        <dl className={styles.factStrip}>
          <div>
            <dt>{t('orders.method')}</dt>
            <dd>{t(order.paymentMethod === 'cod' ? 'orders.method.cod' : 'orders.method.unknown')}</dd>
          </div>
          <div>
            <dt>{t('admin.order.age')}</dt>
            <dd>{ageText}</dd>
          </div>
          {order.completedAt !== null && (
            <div>
              <dt>{t('admin.order.completedAt')}</dt>
              <dd>{dateTime.format(new Date(order.completedAt))}</dd>
            </div>
          )}
          {order.cancelledAt !== null && (
            <div>
              <dt>{t('admin.order.cancelledAt')}</dt>
              <dd>{dateTime.format(new Date(order.cancelledAt))}</dd>
            </div>
          )}
        </dl>
        {order.cancelledReason !== null && (
          <p className={styles.note}>{t('admin.order.cancelledReason', { reason: order.cancelledReason })}</p>
        )}
      </section>

      {/*
        The courier record. A parcel is not a state of the order: this panel states what SteadFast
        accepted and when its status was last read, and nothing here advances the order by itself.
      */}
      {(order.consignment !== null || sendable) && (
        <section className={styles.section} aria-labelledby="order-steadfast">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="order-steadfast">{t('admin.order.steadfast.title')}</h2>
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

          {/*
            The payment screenshot belongs to this card, not to a section of its own (owner direction,
            2026-11-20). It is a fact about the money, and "none was attached" used to occupy a whole
            panel to state an absence. With no image the card states one quiet line and stops.
          */}
          <div className={styles.moneyProof}>
            <div className={styles.sectionHead}>
              <div>
                <h3 className={styles.subTitle}>{t('admin.order.proofTitle')}</h3>
              </div>
              {order.paymentProof !== null && (
                <StatusPill
                  tone={
                    order.paymentProof.reviewState === 'checked'
                      ? 'success'
                      : order.paymentProof.reviewState === 'rejected'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {order.paymentProof.reviewState === 'checked'
                    ? t('admin.order.proofStateChecked')
                    : order.paymentProof.reviewState === 'rejected'
                      ? t('admin.order.proofStateRejected')
                      : t('admin.order.proofStatePending')}
                </StatusPill>
              )}
            </div>

            {order.paymentProof === null ? (
              <p className={styles.note}>{t('admin.order.proofEmpty')}</p>
            ) : (
              <>
                <a
                  className={styles.proofLink}
                  href={`/api/qbpanel/orders/${encodeURIComponent(order.orderNumber)}/proof`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.proofImage}
                    src={`/api/qbpanel/orders/${encodeURIComponent(order.orderNumber)}/proof`}
                    alt={t('admin.order.proofAlt')}
                    width={order.paymentProof.width}
                    height={order.paymentProof.height}
                  />
                </a>
                <p className={styles.note}>
                  {t('admin.order.proofUploadedAt', {
                    time: dateTime.format(new Date(order.paymentProof.uploadedAt)),
                  })}
                  {' - '}
                  {t('admin.order.proofOpenFull')}
                </p>
                {order.paymentProof.reviewedAt !== null && (
                  <p className={styles.note}>
                    {order.paymentProof.reviewState === 'checked'
                      ? t('admin.order.proofCheckedAt', {
                          time: dateTime.format(new Date(order.paymentProof.reviewedAt)),
                        })
                      : t('admin.order.proofRejectedAt', {
                          time: dateTime.format(new Date(order.paymentProof.reviewedAt)),
                        })}
                  </p>
                )}
                {order.paymentProof.reviewNote !== null && (
                  <p className={styles.note}>{order.paymentProof.reviewNote}</p>
                )}

                {canReviewProof && (
                  <form action={ORDER_PROOF_REVIEW_PATH} method="post" className={styles.proofForm}>
                    <input type="hidden" name="csrf" value={csrfToken} />
                    <input type="hidden" name="orderNumber" value={order.orderNumber} />
                    <fieldset className={styles.proofChoices}>
                      <legend className={styles.factLabel}>{t('admin.order.proofDecision')}</legend>
                      <label className={styles.proofChoice}>
                        <input
                          type="radio"
                          name="decision"
                          value="checked"
                          defaultChecked={order.paymentProof.reviewState !== 'rejected'}
                        />
                        <span>{t('admin.order.proofChecked')}</span>
                      </label>
                      <label className={styles.proofChoice}>
                        <input
                          type="radio"
                          name="decision"
                          value="rejected"
                          defaultChecked={order.paymentProof.reviewState === 'rejected'}
                        />
                        <span>{t('admin.order.proofRejected')}</span>
                      </label>
                    </fieldset>
                    <label className={styles.factLabel} htmlFor="proof-note">
                      {t('admin.order.proofNote')}
                    </label>
                    <input
                      id="proof-note"
                      name="note"
                      className={styles.input}
                      maxLength={500}
                      defaultValue={order.paymentProof.reviewNote ?? ''}
                    />
                    <p className={styles.note}>{t('admin.order.proofHint')}</p>
                    <div className={styles.proofActions}>
                      <SubmitButton
                        label={t('admin.order.proofSave')}
                        pendingLabel={t('admin.common.working')}
                      />
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.costsTitle')}</h2>
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
            </div>
          </div>
          <ul className={styles.lineList}>
            {order.items.map((item) => (
              <li className={styles.lineCard} key={item.id} data-order-line="">
                {/*
                  The recorded photograph, first in the row (owner direction, 2026-11-19). It stays the
                  immutable placement snapshot; a line that stored none keeps the same reserved frame so
                  every name in the list still starts in the same column.
                */}
                <ItemPhoto imageKey={item.imageKey} name={pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn} />
                <div className={styles.lineBody}>
                  <span className={styles.lineName}>{pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn}</span>
                  {item.variantLabel !== null && <span className={styles.lineVariant}>{item.variantLabel}</span>}
                  <span className={styles.lineMeta}>
                    <span className={styles.mono}>{item.sku}</span>
                    <span>
                      {price(item.unitPriceMinor)} × {item.quantity}
                    </span>
                  </span>
                </div>
                <div className={styles.lineTotal}>
                  <span className={styles.lineTotalValue}>{price(item.lineTotalMinor)}</span>
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
        </div>


        <aside className={styles.section}>
          {/*
            Where the parcel goes - the owner reads it while on the phone, so it sits beside the
            customer rather than under the line list.
          */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('admin.order.deliveryTitle')}</h2>
            <p className={styles.orderName}>{order.contact.recipientName}</p>
            <a className={styles.orderPhone} href={'tel:' + order.contact.recipientPhone}>
              {order.contact.recipientPhone}
            </a>
            <p className={styles.orderAddress}>{deliveryAddressText(order.contact)}</p>
            {order.contact.deliveryNote !== null && (
              <p className={styles.note}>{t('admin.order.deliveryNote', { note: order.contact.deliveryNote })}</p>
            )}
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('admin.order.customerTitle')}</h2>
            {order.customer.id === null ? (
              <p className={styles.factValue}>{t('admin.order.guestCustomer')}</p>
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

        {/*
          What happened to it: its own card rather than another band under the line list (owner
          direction, 2026-11-20). The audit trail folds shut - it is the same events with actor ids
          attached, and the owner opens it to check one thing, not to read it on arrival.
        */}
        <div className={`${styles.section} ${styles.detailWide}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2>{t('admin.order.historyTitle')}</h2>
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

          {!canReadAudit || order.audit === null ? (
            <p className={styles.note}>{t('admin.order.auditPermission')}</p>
          ) : (
            <details className={styles.trailDetails}>
              <summary>
                <h2>{t('admin.order.auditTitle')}</h2>
                <span className={styles.trailCount}>{order.audit.length}</span>
              </summary>
              {order.audit.length === 0 ? (
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
            </details>
          )}
        </div>
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

  /**
   * Approve with an empty note records the default one (owner feedback, 2026-11-10). The field carries
   * the default as its placeholder, so it starts empty and is filled here only if the owner pressed
   * Approve without typing. The server applies the same default for the no-JavaScript path.
   */
  function fillDefaultReason(event: FormEvent<HTMLFormElement>) {
    const field = event.currentTarget.elements.namedItem('reason');
    if (field instanceof HTMLInputElement && field.value.trim() === '') {
      field.value = t('admin.cod.approveReasonDefault');
    }
  }

  return (
    <section className={styles.actionBand} aria-labelledby="order-action-title">
      {/*
        The head is one line (owner direction, 2026-11-20): the title, the total it applies to, and the
        single sentence of instruction. It used to be a three-line paragraph plus a figure, which cost
        45px of a band whose whole job is a note field and two buttons.
      */}
      <div className={styles.actionBandHead}>
        <h2 className={styles.actionBandTitle} id="order-action-title">
          {waiting ? t('admin.order.decisionTitle') : t('admin.order.operationsTitle')}
        </h2>
        <p className={styles.actionBandBody}>
          {waiting ? t('admin.order.decisionBody') : t('admin.order.operationsBody')}
        </p>
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
              className={styles.approveForm}
              onSubmit={fillDefaultReason}
            >
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="orderId" value={order.orderId} />
              <input type="hidden" name="decision" value="approve" />
              {/*
                The note is one field in the row, not a summary stacked above one. The band is where the
                owner is about to press Accept, so the field they will type in is visible, labelled, and
                on the same line as the button it belongs to - a `<details open>` cost 25px of summary
                above an input that was always shown anyway.
              */}
              <label className={styles.actionNoteLabel} htmlFor="order-approve-reason">
                {t('admin.cod.approveReason')}
              </label>
              <input
                id="order-approve-reason"
                name="reason"
                className={styles.input}
                minLength={10}
                maxLength={500}
                placeholder={t('admin.cod.approveReasonDefault')}
              />
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
                  /** Optional (owner direction, 2026-11-19); see `CodOrderCard`. */
                  required: false,
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
                {/*
                  One line of instruction, then the fields. The paragraph that explained the accounting
                  rule and the paragraph that explained the optional cost were both under controls the
                  owner had already decided to use; the rule now lives in the label and the docs, and
                  the band keeps the one sentence that changes what they press.
                */}
                <p className={styles.note}>{t('admin.order.paidBody')}</p>
                <label className={styles.actionNoteLabel} htmlFor="collect-note">
                  {t('admin.order.paidNote')}
                </label>
                <input id="collect-note" name="note" className={styles.input} maxLength={300} />

                {/*
                  Additional costs are recorded with the receipt, in the same submission and the same
                  transaction. Two blank rows are offered rather than one required row: no cost is a
                  perfectly normal answer, and the owner is never made to invent one to complete. The
                  fieldset is one line of legend plus two one-line rows, so it cannot cost more height
                  than the fields it holds.
                */}
                {canRecordCosts && (
                  <fieldset className={styles.costEntry}>
                    <legend className={styles.costLegend}>{t('admin.order.costsEntryTitle')}</legend>
                    {/*
                      Both costs on one line: amount, description, amount, description. They are
                      independent facts, so two rows of four fields was four rows of scale-height
                      controls stacked for no reason - the second pair sat under a visible gap that read
                      as a separate step. Two rows remain the shape of the data (see the server: the
                      pairs are positional), and each row is still its own amount/description pair.
                    */}
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

