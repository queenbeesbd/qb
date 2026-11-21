'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import type { TranslationKey } from '@/i18n/dictionaries';
import { INTL_LOCALE } from '@/i18n/config';
import { useTranslation } from '@/i18n/useTranslation';
import { deliveryAddressText } from '@/lib/delivery-address';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { orderDiscountMinor } from '@/lib/money';
import {
  ORDER_ADD_LINE_PATH,
  ORDER_COST_PATH,
  ORDER_PROOF_REVIEW_PATH,
  ORDER_TRANSITION_PATH,
} from '@/server/auth/constants';
import { orderStatus } from '../../../_ui/order-status';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { AdminIcon } from '../../../_ui/icons';
import { ItemPhoto } from '../../../_ui/ItemPhoto';
import { ReviewProductPicker, type ReviewProductOption } from '../../../_ui/ReviewProductPicker';
import { Notice, type NoticeTone } from '../../../_ui/Notice';
import { StatusPill, type PillTone } from '../../../_ui/StatusPill';
import { SubmitButton } from '../../../_ui/SubmitButton';
import { ReceiptLink } from './CopyReceiptLink';
import styles from './OrderDetail.module.css';

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
  | 'lineAdded'
  | 'lineInvalid'
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
    /** The account's creation date, or `null` for a guest or a viewer without `customer.read`. */
    createdAt: string | null;
    /** Orders the account has placed, this one included. `null` on a guest order. */
    orderCount: number | null;
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
  paymentProof: {
    uploadedAt: string;
    uploadedBy: string;
    reviewState: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    width: number;
    height: number;
  } | null;
  consignment: {
    invoice: string;
    consignmentId: number;
    trackingCode: string;
    status: string;
    codAmountMinor: number;
    createdAt: string;
    statusCheckedAt: string | null;
  } | null;
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

export type AdminOrderNeighbours = {
  position: number;
  total: number;
  newer: string | null;
  older: string | null;
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
  lineAdded: 'admin.order.notice.lineAdded',
  lineInvalid: 'admin.order.notice.lineInvalid',
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
  'lineInvalid',
];

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
  order_line_added: 'admin.order.event.order_line_added',
};

const ACTOR_KEYS: Record<string, TranslationKey> = {
  customer: 'admin.order.actor.customer',
  staff: 'admin.order.actor.staff',
  system: 'admin.order.actor.system',
};

const RETURN_STATE_KEYS: Record<string, TranslationKey> = {
  requested: 'admin.order.return.requested',
  approved: 'admin.order.return.approved',
  in_transit: 'admin.order.return.in_transit',
  received: 'admin.order.return.received',
  inspected_accepted: 'admin.order.return.inspected_accepted',
  inspected_rejected: 'admin.order.return.inspected_rejected',
  closed: 'admin.order.return.closed',
};

const COD_KEYS: Record<string, TranslationKey> = {
  cod_pending_approval: 'orders.cod.cod_pending_approval',
  cod_approved: 'orders.cod.cod_approved',
  cod_collected: 'orders.cod.cod_collected',
  cod_failed: 'orders.cod.cod_failed',
  cod_reconciled: 'orders.cod.cod_reconciled',
  not_applicable: 'admin.order.paymentNotApplicable',
};

function codTone(state: string): PillTone {
  if (state === 'cod_collected' || state === 'cod_reconciled') return 'success';
  if (state === 'cod_failed') return 'danger';
  if (state === 'cod_pending_approval') return 'warning';
  if (state === 'cod_approved') return 'info';
  return 'neutral';
}

function returnTone(state: string): PillTone {
  if (state === 'inspected_rejected') return 'danger';
  if (state === 'inspected_accepted') return 'success';
  if (state === 'received') return 'warning';
  return 'info';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part !== '');
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase();
}

/** A recorded value. Read-only by construction, never a disabled form field. */
function ReadOnlyField({
  label,
  value,
  prefix,
  suffix,
  icon,
}: {
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  icon?: 'user' | 'mail' | 'phone' | 'home' | 'mapPin';
}) {
  const id = useId();
  const classes = [styles.control, prefix === undefined ? '' : styles.hasPrefix, suffix === undefined ? '' : styles.hasSuffix, icon === undefined ? '' : styles.hasLead]
    .filter((entry) => entry !== '')
    .join(' ');
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={classes}>
        {icon !== undefined && <AdminIcon className={styles.leadIcon} name={icon} />}
        {prefix !== undefined && <span className={styles.prefix}>{prefix}</span>}
        <input id={id} value={value} readOnly tabIndex={-1} aria-readonly="true" />
        {suffix !== undefined && <span className={styles.suffix}>{suffix}</span>}
      </div>
    </div>
  );
}

/** One card with a collapsing head, the reference's shape for every block on the page. */
function Section({
  id,
  title,
  aside,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={styles.card} aria-labelledby={id}>
      <div
        className={styles.cardHead}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('button, a, input, select, textarea, label')) return;
          setOpen((value) => !value);
        }}
      >
        <h2 className={styles.cardTitle} id={id}>
          {title}
        </h2>
        {aside !== undefined && <div className={styles.headAside}>{aside}</div>}
        <button
          type="button"
          className={styles.chevron}
          data-open={open ? 'true' : 'false'}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          aria-label={t('admin.order.toggleSection', { section: title })}
          onClick={() => setOpen((value) => !value)}
        >
          <AdminIcon name="chevronDown" />
        </button>
      </div>
      {/*
        Collapsed by height rather than by `hidden`, so the disclosure moves like the reference's own
        accordions. `inert` keeps a closed section out of the tab order and the accessibility tree, so
        the motion never hides a control from someone navigating by keyboard.
      */}
      <div className={styles.collapse} data-open={open ? 'true' : 'false'}>
        <div className={styles.collapseClip}>
          <div className={styles.sectionBody} id={`${id}-body`} inert={!open} aria-hidden={!open}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

type StageState = 'done' | 'current' | 'future';

type OrderStage = {
  readonly key: TranslationKey;
  readonly at: string | null;
  readonly state: StageState;
};

/**
 * The four movement stages, read from the timestamps and the fulfilment status. Every reached stage
 * rests on a stored timestamp or a stored state that could not be true without it; `completed` is not
 * a delivery (cash is often collected while the parcel is still with the courier), and a cancelled or
 * returned order is closed rather than "current".
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
  const terminal = order.status === 'cancelled' || order.status === 'returned';
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
 * **Everything that reads as a field is a record.** The price, the line total, the quantity, the zone
 * and the totals are drawn in the reference's field shape with `readOnly` (or as plain output), because
 * an order is immutable: the amounts were frozen at placement and are covered by the database's own
 * trigger. Only the action forms write, and they write through the same endpoints as before.
 *
 * Two things are deliberately absent. **No reconciliation control**: the owner has not defined what
 * matching a courier statement means, so `cod_reconciled` is unreachable. **No stock control**: a
 * returned parcel is inspected and its finding recorded, but making the product orderable again is a
 * separate, deliberate act on the product screen (ADR 0013).
 */
export function AdminOrderDetailView({
  order,
  notice,
  neighbours,
  receiptUrl,
  csrfToken,
  canApprove,
  canCancel,
  canFulfil,
  canCollect,
  canInspect,
  canRecordCosts,
  canReviewProof,
  canAddLine,
  pickableProducts,
  addLineKey,
  canReadCustomers,
  canReadAudit,
  returnTo,
}: {
  order: AdminOrderDetailModel;
  notice: AdminOrderNotice | null;
  neighbours: AdminOrderNeighbours;
  /** The customer's receipt address, built from the request host on the server. */
  receiptUrl: string;
  csrfToken: string;
  canApprove: boolean;
  canCancel: boolean;
  canFulfil: boolean;
  canCollect: boolean;
  canInspect: boolean;
  canRecordCosts: boolean;
  canReviewProof: boolean;
  /** ADR 0046: this viewer may append a line, and the order is still before dispatch. */
  canAddLine: boolean;
  pickableProducts: readonly ReviewProductOption[];
  /** A fresh UUID for this render; the service makes a repeated submission one recorded addition. */
  addLineKey: string;
  canReadCustomers: boolean;
  canReadAudit: boolean;
  returnTo: { href: string; labelKey: TranslationKey };
}) {
  const { t, price, pick } = useTranslation();
  const [printMenu, setPrintMenu] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addedProductId, setAddedProductId] = useState<number | null>(null);
  const dateTime = new Intl.DateTimeFormat(INTL_LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const stageDate = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium' });
  const dayDate = new Intl.DateTimeFormat(INTL_LOCALE, { dateStyle: 'medium' });
  const takaFormat = new Intl.NumberFormat(INTL_LOCALE, { maximumFractionDigits: 2 });
  const taka = (minor: number): string => takaFormat.format(minor / 100);

  const waiting = order.codState === 'cod_pending_approval' && order.status === 'pending';
  const status = orderStatus(order);
  const noticeTone: NoticeTone = notice !== null && ERROR_NOTICES.includes(notice) ? 'error' : 'success';

  const approvedForDispatch =
    (order.paymentMethod === 'cod' && order.codState === 'cod_approved') ||
    (order.paymentMethod !== 'cod' && order.paymentState === 'verified');
  const dispatchable = approvedForDispatch && (order.status === 'confirmed' || order.status === 'processing');
  const awaitingDeliveryOutcome = order.status === 'shipped' && order.codState === 'cod_approved';
  const returnAwaitingReceipt =
    order.status === 'shipped' &&
    order.codState === 'cod_failed' &&
    order.returns.some((entry) => entry.state === 'requested' || entry.state === 'approved' || entry.state === 'in_transit');
  const receivable =
    order.codState === 'cod_approved' && (order.status === 'shipped' || order.status === 'delivered');
  const completable =
    order.status === 'delivered' && (order.codState === 'cod_collected' || order.codState === 'cod_failed');
  const cancellable = order.status === 'pending' || order.status === 'confirmed' || order.status === 'processing';
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

  const hasOperations =
    dispatchable ||
    awaitingDeliveryOutcome ||
    receivable ||
    returnAwaitingReceipt ||
    completable ||
    (cancellable && canCancel);

  const progress = orderStages(order);

  const discountMinor = orderDiscountMinor(order.itemsSubtotalMinor, order.shippingMinor, order.totalMinor);
  const discountPercent =
    order.itemsSubtotalMinor === 0
      ? 0
      : Math.round((discountMinor / order.itemsSubtotalMinor) * 1000) / 10;
  const unitCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const collected =
    order.codState === 'cod_collected' ||
    order.codState === 'cod_reconciled' ||
    (order.paymentMethod !== 'cod' && order.paymentState === 'verified');
  const amountDueMinor = collected ? 0 : order.totalMinor;
  const codLabel = COD_KEYS[order.codState] ?? 'orders.cod.unknown';
  const deliveryZone =
    order.contact.districtCode === null ? null : deliveryAreaName(order.contact.districtCode);
  const customerPhone = order.contact.recipientPhone.replace(/\D/g, '');
  const whatsappHref = /^01[3-9]\d{8}$/.test(customerPhone)
    ? `https://wa.me/88${customerPhone}`
    : null;

  const recordedNotes = order.events
    .filter((event) => event.reason !== null && event.reason.trim() !== '')
    .slice(-3)
    .reverse();

  return (
    <div className={styles.frame}>
      {/* ---- The order strip: identity, print actions and the pager ------- */}
      <div className={styles.strip}>
        <div className={styles.orderBar}>
          <Link
            className={styles.iconButton}
            href={returnTo.href}
            aria-label={t(returnTo.labelKey)}
            title={t(returnTo.labelKey)}
          >
            <AdminIcon name="arrowLeft" />
          </Link>
          <h1 className={styles.orderBarTitle}>{t('admin.order.barTitle', { number: order.orderNumber })}</h1>
          <div className={styles.barActions}>
            <div className={styles.splitWrap}>
              <div className={styles.split}>
                <Link
                  className={styles.splitMain}
                  href={`/qbpanel/orders/${encodeURIComponent(order.orderNumber)}/slip`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('admin.order.printSlip')}
                  title={t('admin.order.printSlip')}
                >
                  <AdminIcon name="printer" />
                </Link>
                <button
                  type="button"
                  className={styles.splitToggle}
                  aria-expanded={printMenu}
                  aria-haspopup="menu"
                  aria-label={t('admin.order.printMenu')}
                  onClick={() => setPrintMenu((value) => !value)}
                >
                  <AdminIcon name="chevronDown" />
                </button>
              </div>
              {printMenu && (
                <>
                  <button
                    type="button"
                    className={styles.menuScrim}
                    aria-label={t('admin.order.closeMenu')}
                    onClick={() => setPrintMenu(false)}
                  />
                  <div className={styles.splitMenu} role="menu">
                    <a
                      role="menuitem"
                      href={`/qbpanel/orders/${encodeURIComponent(order.orderNumber)}/slip`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPrintMenu(false)}
                    >
                      {t('admin.order.menuSlip')}
                    </a>
                    <a
                      role="menuitem"
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setPrintMenu(false)}
                    >
                      {t('admin.order.menuReceipt')}
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className={styles.pager} aria-label={t('admin.order.pagerLabel')}>
          {neighbours.newer === null ? (
            <span className={`${styles.pagerButton} ${styles.pagerOff}`} aria-disabled="true">
              <AdminIcon name="arrowLeft" />
              {t('admin.order.previous')}
            </span>
          ) : (
            <Link
              className={styles.pagerButton}
              href={`/qbpanel/orders/${encodeURIComponent(neighbours.newer)}`}
            >
              <AdminIcon name="arrowLeft" />
              {t('admin.order.previous')}
            </Link>
          )}
          <span className={styles.pagerCount}>
            <b>{neighbours.position}</b> {t('admin.order.positionOf', { total: neighbours.total })}
          </span>
          {neighbours.older === null ? (
            <span className={`${styles.pagerButton} ${styles.pagerNext} ${styles.pagerOff}`} aria-disabled="true">
              {t('admin.order.next')}
              <AdminIcon name="arrowRight" />
            </span>
          ) : (
            <Link
              className={`${styles.pagerButton} ${styles.pagerNext}`}
              href={`/qbpanel/orders/${encodeURIComponent(neighbours.older)}`}
            >
              {t('admin.order.next')}
              <AdminIcon name="arrowRight" />
            </Link>
          )}
        </nav>
      </div>

      {/* ---- The order card --------------------------------------------- */}
      <section className={styles.card} aria-labelledby="order-record">
        <div className={styles.summaryCard}>
          <div className={styles.orderIdentity}>
            <h2 className={styles.orderTitleRow} id="order-record">
              {t('admin.order.barTitle', { number: order.orderNumber })}
              <StatusPill tone={status.tone}>{t(status.label)}</StatusPill>
            </h2>
            <p className={styles.orderId}>
              <span>{t('admin.order.idLabel')}:</span>
              <b>{order.orderId}</b>
            </p>
            <p className={styles.placedLine}>
              {t('admin.cod.placedAt', { time: dateTime.format(new Date(order.placedAt)) })}
            </p>
          </div>
          <div className={styles.orderReceipt}>
            <hr className={styles.rule} />
            <ReceiptLink href={receiptUrl} />
          </div>
        </div>
      </section>

      {notice !== null && (
        <div className={styles.noticeRow}>
          <Notice tone={noticeTone}>{t(NOTICE_KEYS[notice])}</Notice>
        </div>
      )}

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

      {/* ---- Products --------------------------------------------------- */}
      <Section
        id="order-products"
        title={t('admin.order.productsTitle')}
        aside={
          <span className={styles.countPill} aria-label={t('admin.order.itemsCountLabel', { count: unitCount })}>
            {unitCount === 1 ? t('admin.order.itemCountOne') : t('admin.order.itemCountMany', { count: unitCount })}
          </span>
        }
      >
        {order.items.map((item) => {
          const itemName = pick({ bn: item.nameBn, en: item.nameEn }) ?? item.nameEn;
          /* A pack label that only repeats the product name says nothing; it is not drawn twice. */
          const packLabel =
            item.variantLabel !== null && item.variantLabel.trim() !== itemName.trim() ? item.variantLabel : null;
          return (
          <article className={styles.product} key={item.id} data-order-line="">
            <div className={styles.productMedia}>
              <ItemPhoto imageKey={item.imageKey} name={itemName} size="hero" />
              <span className={styles.ownBadge}>
                <AdminIcon name="box" />
                {t('admin.order.ownProduct')}
              </span>
            </div>
            <div className={styles.productBody}>
              <h3 className={styles.productName}>{itemName}</h3>
              {packLabel !== null && <p className={styles.productVariant}>{packLabel}</p>}
              <div className={styles.grid2}>
                <ReadOnlyField label={t('admin.order.unitPrice')} prefix="Tk" value={taka(item.unitPriceMinor)} />
                <ReadOnlyField label={t('admin.order.lineTotal')} prefix="Tk" value={taka(item.lineTotalMinor)} />
              </div>
              <ReadOnlyField label={t('admin.order.sku')} value={item.sku} />
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepperButton}
                  disabled
                  aria-label={t('admin.order.decreaseQuantity')}
                >
                  −
                </button>
                <output className={styles.stepperValue} aria-label={t('admin.order.quantity')}>
                  {item.quantity}
                </output>
                <button
                  type="button"
                  className={styles.stepperButton}
                  disabled
                  aria-label={t('admin.order.increaseQuantity')}
                >
                  +
                </button>
              </div>
            </div>
          </article>
          );
        })}
        {canAddLine && (
          <div className={styles.addLineBox}>
            <h3 className={styles.addLineTitle}>{t('admin.order.addLineTitle')}</h3>
            <p className={styles.helper}>{t('admin.order.addLineBody')}</p>
            <form action={ORDER_ADD_LINE_PATH} method="post" className={styles.addLineForm}>
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="orderId" value={order.orderId} />
              <input type="hidden" name="idempotencyKey" value={addLineKey} />
              <div className={styles.field}>
                <label className={styles.label} id="order-product-label" htmlFor="order-product">
                  {t('admin.order.addLineProduct')}
                </label>
                <ReviewProductPicker
                  products={pickableProducts}
                  value={addedProductId}
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  onChange={setAddedProductId}
                  label={t('admin.order.addLinePickerLabel')}
                  placeholder={t('admin.order.addLinePickerPlaceholder')}
                  searchLabel={t('admin.order.addLineSearch')}
                  emptyLabel={t('admin.order.addLinePickerEmpty')}
                  closeLabel={t('admin.order.addLinePickerClose')}
                  idPrefix="order-product"
                  hint={t('admin.order.addLineHint')}
                />
              </div>
              <div className={styles.grid2}>
                <label className={styles.field}>
                  <span className={styles.label}>{t('admin.order.addLineQuantity')}</span>
                  <input
                    className={styles.input}
                    type="number"
                    name="quantity"
                    min={1}
                    max={20}
                    step={1}
                    defaultValue={1}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t('admin.order.addLineReason')}</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="reason"
                    maxLength={500}
                    placeholder={t('admin.order.addLineReasonPlaceholder')}
                  />
                </label>
              </div>
              <SubmitButton
                label={t('admin.order.addLineSubmit')}
                pendingLabel={t('admin.common.working')}
                disabled={addedProductId === null}
              />
            </form>
          </div>
        )}
        <p className={styles.helper}>{t('admin.order.quantityFixed')}</p>
      </Section>

      {/* ---- Order summary ---------------------------------------------- */}
      <Section id="order-summary" title={t('admin.order.summaryTitle')}>
        <div className={styles.summaryGrid}>
        <div className={styles.band}>
          <div className={styles.bandHead}>
            <span className={`${styles.tile} ${styles.tileDiscount}`}>
              <AdminIcon name="percent" />
            </span>
            {t('orders.discount')}
          </div>
          <div className={styles.grid2}>
            <ReadOnlyField label={t('admin.order.percentage')} suffix="%" value={takaFormat.format(discountPercent)} />
            <ReadOnlyField label={t('admin.order.amount')} prefix="Tk" value={taka(discountMinor)} />
          </div>
        </div>

        <div className={styles.band}>
          <div className={styles.bandHead}>
            <span className={`${styles.tile} ${styles.tileItems}`}>
              <AdminIcon name="receipt" />
            </span>
            {t('admin.order.itemsBand')}
          </div>
          <div className={styles.grid2}>
            <ReadOnlyField label={t('admin.order.units')} value={String(unitCount)} />
            <ReadOnlyField label={t('cart.subtotal')} prefix="Tk" value={taka(order.itemsSubtotalMinor)} />
          </div>
        </div>

        <div className={styles.band}>
          <div className={styles.bandHead}>
            <span className={`${styles.tile} ${styles.tileDelivery}`}>
              <AdminIcon name="truck" />
            </span>
            {t('admin.order.deliveryBand')}
          </div>
          <ReadOnlyField label={t('admin.order.zone')} value={deliveryZone ?? t('admin.order.notRecorded')} />
          <ReadOnlyField
            label={t('admin.order.charge')}
            prefix="Tk"
            value={order.contact.districtCode === null ? t('admin.order.notRecorded') : taka(order.shippingMinor)}
          />
        </div>

        <div className={styles.band}>
          <div className={styles.bandHead}>
            <span className={`${styles.tile} ${styles.tilePayment}`}>
              <AdminIcon name="check" />
            </span>
            {t('admin.order.paymentBand')}
          </div>
          <div className={styles.field}>
            <span className={styles.label}>{t('admin.customers.status')}</span>
            <div className={styles.stateRow}>
              <strong>{t(order.paymentMethod === 'cod' ? 'orders.method.cod' : 'orders.method.unknown')}</strong>
              <StatusPill tone={codTone(order.codState)}>{t(codLabel)}</StatusPill>
            </div>
          </div>
          <ReadOnlyField
            label={t('admin.order.amountCollected')}
            prefix="Tk"
            value={collected ? taka(order.totalMinor) : taka(0)}
          />
        </div>
        </div>

        <div className={styles.totals}>
          <div className={`${styles.totalBlock} ${styles.totalDue}`}>
            <p className={styles.totalLabel}>{t('admin.order.amountDue')}</p>
            <p className={styles.totalValue}>{price(amountDueMinor)}</p>
          </div>
          <div className={`${styles.totalBlock} ${styles.totalGrand}`}>
            <p className={styles.totalLabel}>{t('admin.order.grandTotal')}</p>
            <p className={styles.totalValue}>{price(order.totalMinor)}</p>
          </div>
        </div>
        {order.contact.districtCode === null && (
          <p className={styles.subNote}>{t('admin.order.legacyDeliveryNote')}</p>
        )}
      </Section>

      {/* ---- Delivery information and the notes that were recorded ----- */}
      <div className={styles.pairGrid}>
      <Section
        id="order-delivery"
        title={t('admin.order.deliveryInfoTitle')}
        aside={
          order.consignment !== null ? (
            <StatusPill tone="info">{order.consignment.status}</StatusPill>
          ) : undefined
        }
      >
        {order.consignment === null ? (
          courierReady ? (
            <>
              <p className={styles.helper}>{t('admin.order.steadfast.notSent')}</p>
              {sendable && canApprove && (
                <form action="/api/qbpanel/orders/consignment" method="post" className={styles.courierActions}>
                  <input type="hidden" name="csrf" value={csrfToken} />
                  <input type="hidden" name="operation" value="send" />
                  <input type="hidden" name="orderNumber" value={order.orderNumber} />
                  <SubmitButton label={t('admin.order.steadfast.send')} pendingLabel={t('admin.common.working')} />
                </form>
              )}
            </>
          ) : (
            <div className={styles.courierBox}>
              <span className={styles.courierIcon}>
                <AdminIcon name="truck" />
              </span>
              <h3>{t('admin.order.steadfast.offTitle')}</h3>
              <p>{t('admin.order.steadfast.offBody')}</p>
              <div className={styles.courierActions}>
                <Link className={styles.button} href="/qbpanel/settings/integrations/steadfast">
                  {t('admin.order.steadfast.openSettings')}
                </Link>
              </div>
            </div>
          )
        ) : (
          <>
            <div className={styles.consignmentFacts}>
              <div>
                <span className={styles.factLabel}>{t('admin.order.steadfast.invoice')}</span>
                <p className={`${styles.factValue} ${styles.mono}`}>{order.consignment.invoice}</p>
              </div>
              <div>
                <span className={styles.factLabel}>{t('admin.order.steadfast.consignmentId')}</span>
                <p className={`${styles.factValue} ${styles.mono}`}>{order.consignment.consignmentId}</p>
              </div>
              <div>
                <span className={styles.factLabel}>{t('admin.order.steadfast.trackingCode')}</span>
                <p className={`${styles.factValue} ${styles.mono}`}>{order.consignment.trackingCode}</p>
              </div>
              <div>
                <span className={styles.factLabel}>{t('admin.order.steadfast.codAmount')}</span>
                <p className={styles.factValue}>{price(order.consignment.codAmountMinor)}</p>
              </div>
              <div>
                <span className={styles.factLabel}>{t('admin.order.steadfast.bookedAt')}</span>
                <p className={styles.factValue}>{dateTime.format(new Date(order.consignment.createdAt))}</p>
              </div>
            </div>
            <div className={styles.courierActions}>
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
            </div>
            <p className={styles.helper}>
              {order.consignment.statusCheckedAt === null
                ? t('admin.order.steadfast.neverChecked')
                : t('admin.order.steadfast.checkedAt', {
                    time: dateTime.format(new Date(order.consignment.statusCheckedAt)),
                  })}
            </p>
          </>
        )}
      </Section>

      {/* ---- Order note: what was actually recorded --------------------- */}
      <Section id="order-note" title={t('admin.order.noteTitle')}>
        {order.contact.deliveryNote !== null && (
          <div className={styles.noteQuote}>
            <p className={styles.noteQuoteLabel}>
              <span>{t('admin.order.noteCustomerLabel')}</span>
              <span>{t('admin.order.noteFromCheckout')}</span>
            </p>
            <p className={styles.noteQuoteText}>{order.contact.deliveryNote}</p>
          </div>
        )}
        {recordedNotes.map((event) => (
          <div className={styles.noteQuote} key={event.id}>
            <p className={styles.noteQuoteLabel}>
              <span>
                {EVENT_KEYS[event.eventType] === undefined ? event.eventType : t(EVENT_KEYS[event.eventType] as TranslationKey)}
              </span>
              <span>{dateTime.format(new Date(event.occurredAt))}</span>
            </p>
            <p className={styles.noteQuoteText}>{event.reason}</p>
          </div>
        ))}
        {order.contact.deliveryNote === null && recordedNotes.length === 0 && (
          <p className={styles.emptyBody}>{t('admin.order.noteEmpty')}</p>
        )}
        {order.cancelledReason !== null && (
          <div className={styles.noteQuote}>
            <p className={styles.noteQuoteLabel}>
              <span>{t('admin.order.event.order_cancelled')}</span>
              {order.cancelledAt !== null && (
                <span>{dateTime.format(new Date(order.cancelledAt))}</span>
              )}
            </p>
            <p className={styles.noteQuoteText}>{order.cancelledReason}</p>
          </div>
        )}
        <p className={styles.helper}>{t('admin.order.noteHelper')}</p>
      </Section>
      </div>

      {/* ---- Order information ------------------------------------------ */}
      <Section id="order-info" title={t('admin.order.infoTitle')}>
        <div className={styles.infoGrid}>
          <div className={styles.infoFields}>
            <ReadOnlyField
              label={t('admin.order.methodLabel')}
              value={t(order.paymentMethod === 'cod' ? 'orders.method.cod' : 'orders.method.unknown')}
            />
            <div className={styles.field}>
              <span className={styles.label}>{t('admin.order.statusLabel')}</span>
              <div className={styles.control}>
                <output>{t(status.label)}</output>
              </div>
            </div>
          </div>

          <ol
            className={styles.progressTrack}
            data-order-progress=""
            data-state={progress.terminal ? 'closed' : undefined}
          >
          {progress.stages.map((stage) => (
            <li
              className={styles.progressStep}
              key={stage.key}
              data-state={stage.state}
              aria-current={stage.state === 'current' ? 'step' : undefined}
            >
              <span className={styles.progressMark} aria-hidden="true">
                {stage.state === 'done' ? <AdminIcon name="check" width={13} height={13} /> : <span className={styles.progressDot} />}
              </span>
              <span className={styles.progressLabel}>{t(stage.key)}</span>
                <span className={styles.progressWhen}>{stage.at === null ? '' : stageDate.format(new Date(stage.at))}</span>
              </li>
            ))}
          </ol>
        </div>

        <dl className={styles.factGrid}>
          <div>
            <dt className={styles.factLabel}>{t('admin.order.age')}</dt>
            <dd className={styles.factValue}>{ageText}</dd>
          </div>
          {order.confirmedAt !== null && (
            <div>
              <dt className={styles.factLabel}>{t('admin.order.confirmedAt')}</dt>
              <dd className={styles.factValue}>{dateTime.format(new Date(order.confirmedAt))}</dd>
            </div>
          )}
          {order.completedAt !== null && (
            <div>
              <dt className={styles.factLabel}>{t('admin.order.completedAt')}</dt>
              <dd className={styles.factValue}>{dateTime.format(new Date(order.completedAt))}</dd>
            </div>
          )}
          {order.cancelledAt !== null && (
            <div>
              <dt className={styles.factLabel}>{t('admin.order.cancelledAt')}</dt>
              <dd className={styles.factValue}>{dateTime.format(new Date(order.cancelledAt))}</dd>
            </div>
          )}
        </dl>
      </Section>

      {/* ---- Customer --------------------------------------------------- */}
      <Section
        id="order-customer"
        title={t('admin.order.customerTitle')}
        aside={
          order.customer.id !== null && canReadCustomers ? (
            <Link className={styles.profileChip} href={`/qbpanel/customers/${order.customer.id}`}>
              {t('admin.order.viewCustomer')}
              <AdminIcon name="arrowUpRight" />
            </Link>
          ) : undefined
        }
      >
        <div className={styles.customerTop}>
          <span className={styles.avatar} aria-hidden="true">
            {initialsOf(order.contact.recipientName)}
          </span>
          <div className={styles.customerMain}>
            <div className={styles.customerHead}>
              <div>
                <p className={styles.customerName}>{order.contact.recipientName}</p>
                <p className={styles.customerPhone}>{order.contact.recipientPhone}</p>
              </div>
            </div>
            <div className={styles.chipRow}>
              <a className={styles.chip} href={`tel:${order.contact.recipientPhone}`}>
                <AdminIcon name="phone" />
                {t('admin.order.call')}
              </a>
              {whatsappHref !== null && (
                <a
                  className={`${styles.chip} ${styles.chipWa}`}
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AdminIcon name="message" />
                  {t('admin.order.whatsapp')}
                </a>
              )}
            </div>
          </div>
        </div>

        <p className={styles.overline}>{t('admin.order.contactDetails')}</p>
        <div className={styles.contactFields}>
          <ReadOnlyField label={t('admin.order.customerNameField')} value={order.contact.recipientName} icon="user" />
          {order.customer.id !== null &&
            (canReadCustomers ? (
              <ReadOnlyField
                label={t('admin.order.customerEmailField')}
                value={order.customer.email ?? t('admin.order.noEmail')}
                icon="mail"
              />
            ) : (
              <p className={styles.helper}>{t('admin.order.customerPermission')}</p>
            ))}
          <ReadOnlyField label={t('admin.order.customerPhoneField')} value={order.contact.recipientPhone} icon="phone" />
          <ReadOnlyField
            label={t('admin.order.customerAddressField')}
            value={deliveryAddressText(order.contact)}
            icon="home"
          />
        </div>

        <div className={styles.validity}>
          <div className={styles.validityHead}>
            <span className={`${styles.tile} ${styles.tileDelivery}`}>
              <AdminIcon name="shield" />
            </span>
            <strong>{t('admin.order.validityTitle')}</strong>
          </div>
          {order.customer.id === null ? (
            <p className={styles.emptyBody}>{t('admin.order.validityGuest')}</p>
          ) : (
            <>
              <div className={styles.validityGrid}>
                <div>
                  <span className={styles.factLabel}>{t('admin.order.validityOrders')}</span>
                  <p className={styles.factValue}>{order.customer.orderCount ?? 1}</p>
                </div>
                {order.customer.createdAt !== null && (
                  <div>
                    <span className={styles.factLabel}>{t('admin.customers.joined')}</span>
                    <p className={styles.factValue}>{dayDate.format(new Date(order.customer.createdAt))}</p>
                  </div>
                )}
                <div>
                  <span className={styles.factLabel}>{t('admin.customers.status')}</span>
                  <p className={styles.factValue}>
                    <StatusPill tone={order.customer.status === 'active' ? 'success' : 'danger'}>
                      {order.customer.status === 'active'
                        ? t('admin.customers.active')
                        : t('admin.customers.suspended')}
                    </StatusPill>
                  </p>
                </div>
              </div>
              <div className={styles.validityRule} />
              <div className={styles.validityFoot}>
                <p>{t('admin.order.validityBody')}</p>
                {canReadCustomers && (
                  <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href={`/qbpanel/customers/${order.customer.id}`}>
                    {t('admin.order.validityManage')}
                    <AdminIcon name="arrowUpRight" />
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </Section>

      {/* ---- The shop's own money, kept apart from the customer's invoice -- */}
      <Section id="order-proceeds" title={t('admin.order.moneyTitle')} defaultOpen={false}>
        <dl className={styles.moneyGrid}>
          <div className={styles.moneyItem}>
            <dt className={styles.moneyLabel}>{t('admin.order.moneyCustomerPayment')}</dt>
            <dd className={styles.moneyValue}>{price(order.money.customerPaymentMinor)}</dd>
          </div>
          <div className={styles.moneyItem}>
            <dt className={styles.moneyLabel}>{t('admin.order.moneyStandardFee')}</dt>
            <dd className={styles.moneyValue}>{price(order.money.standardDeliveryFeeMinor)}</dd>
          </div>
          <div className={styles.moneyItem}>
            <dt className={styles.moneyLabel}>{t('admin.order.moneyAdditionalCosts')}</dt>
            <dd className={styles.moneyValue}>{price(order.money.additionalCostsMinor)}</dd>
          </div>
          <div className={styles.moneyItem}>
            <dt className={styles.moneyLabel}>{t('admin.order.moneyNetEstimate')}</dt>
            <dd className={styles.moneyValue}>
              {order.money.estimatedNetProceedsMinor === null
                ? t('admin.order.moneyUnavailable')
                : price(order.money.estimatedNetProceedsMinor)}
            </dd>
          </div>
        </dl>
        {order.money.estimatedNetProceedsMinor === null && (
          <p className={styles.helper}>{t('admin.order.moneyUnsubstantiated')}</p>
        )}
      </Section>

      {/* ---- Payment screenshot ----------------------------------------- */}
      {order.paymentProof !== null && (
        <Section
          id="order-proof"
          title={t('admin.order.proofTitle')}
          aside={
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
          }
        >
          <div className={styles.proofGrid}>
            <a
              className={styles.proofLink}
              href={`/api/qbpanel/orders/${encodeURIComponent(order.orderNumber)}/proof`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className={styles.proofImage}
                src={`/api/qbpanel/orders/${encodeURIComponent(order.orderNumber)}/proof`}
                alt={t('admin.order.proofAlt')}
                width={order.paymentProof.width}
                height={order.paymentProof.height}
              />
            </a>
            <div>
              <p className={styles.helper}>
                {t('admin.order.proofUploadedAt', {
                  time: dateTime.format(new Date(order.paymentProof.uploadedAt)),
                })}
              </p>
              <p className={styles.helper}>{t('admin.order.proofOpenFull')}</p>
              {order.paymentProof.reviewedAt !== null && (
                <p className={styles.helper}>
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
                <p className={styles.noteQuoteText}>{order.paymentProof.reviewNote}</p>
              )}
            </div>
          </div>

          {canReviewProof && (
            <form action={ORDER_PROOF_REVIEW_PATH} method="post" className={styles.proofForm}>
              <input type="hidden" name="csrf" value={csrfToken} />
              <input type="hidden" name="orderNumber" value={order.orderNumber} />
              <fieldset className={styles.proofChoices}>
                <legend className={styles.label}>{t('admin.order.proofDecision')}</legend>
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
              <label className={styles.label} htmlFor="proof-note">
                {t('admin.order.proofNote')}
              </label>
              <input
                id="proof-note"
                name="note"
                className={styles.input}
                maxLength={500}
                defaultValue={order.paymentProof.reviewNote ?? ''}
              />
              <p className={styles.helper}>{t('admin.order.proofHint')}</p>
              <div className={styles.proofActions}>
                <SubmitButton label={t('admin.order.proofSave')} pendingLabel={t('admin.common.working')} />
              </div>
            </form>
          )}
        </Section>
      )}

      {/* ---- Additional courier costs ------------------------------------ */}
      {order.costs.length > 0 && (
        <Section id="order-costs" title={t('admin.order.costsTitle')}>
          <ul className={styles.recordList}>
            {order.costs.map((cost) => (
              <li className={styles.record} key={cost.id}>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>{cost.description}</span>
                  <span className={styles.recordMeta}>
                    <span>{dateTime.format(new Date(cost.recordedAt))}</span>
                    {cost.voidedAt !== null && <span>{t('admin.order.costVoided', { reason: cost.voidReason ?? '' })}</span>}
                  </span>
                </div>
                <div className={styles.recordSide}>
                  <span className={cost.voidedAt === null ? styles.recordPrice : `${styles.recordPrice} ${styles.recordVoided}`}>
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
                        <input id={`void-reason-${cost.id}`} name="reason" className={styles.input} maxLength={200} />
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
        </Section>
      )}

      {/* ---- Returned goods --------------------------------------------- */}
      {order.returns.length > 0 && (
        <Section id="order-returns" title={t('admin.order.returnsTitle')}>
          <ul className={styles.recordList}>
            {order.returns.map((entry) => (
              <li className={styles.record} key={entry.id}>
                <div className={styles.recordMain}>
                  <span className={styles.recordTitle}>
                    {pick({ bn: entry.nameBn, en: entry.nameEn }) ?? entry.nameEn}
                  </span>
                  <span className={styles.recordMeta}>
                    <span className={styles.mono}>{entry.sku}</span>
                    <span>{t('admin.order.returnQuantity', { count: entry.quantity })}</span>
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
                    <div className={styles.approveForm}>
                      <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                        <input type="hidden" name="csrf" value={csrfToken} />
                        <input type="hidden" name="action" value="inspect_accepted" />
                        <input type="hidden" name="returnId" value={entry.id} />
                        <details className={styles.noteDetails}>
                          <summary>{t('admin.order.inspectAcceptedSummary')}</summary>
                          <label className="sr-only" htmlFor={'accept-note-' + entry.id}>
                            {t('admin.order.inspectAcceptedNote')}
                          </label>
                          <textarea id={'accept-note-' + entry.id} name="note" className={styles.input} rows={2} maxLength={300} />
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
          <p className={styles.helper}>{t('admin.order.returnsStockNote')}</p>
        </Section>
      )}

      {/* ---- History ---------------------------------------------------- */}
      <Section id="order-history" title={t('admin.order.historyTitle')}>
        {order.events.length === 0 ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>{t('admin.order.noHistoryTitle')}</h3>
            <p className={styles.emptyBody}>{t('admin.order.noHistoryBody')}</p>
          </div>
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
          <p className={styles.helper}>{t('admin.order.auditPermission')}</p>
        ) : (
          <details className={styles.trailDetails}>
            <summary>
              <h3>{t('admin.order.auditTitle')}</h3>
              <span className={styles.trailCount}>{order.audit.length}</span>
            </summary>
            {order.audit.length === 0 ? (
              <div className={styles.emptyState}>
                <h3 className={styles.emptyTitle}>{t('admin.order.noAuditTitle')}</h3>
                <p className={styles.emptyBody}>{t('admin.order.noAuditBody')}</p>
              </div>
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
      </Section>
    </div>
  );
}

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

/**
 * The order's next legal action, directly under the order card.
 *
 * Only a legal step is offered. Every form is the same guarded route the rest of the admin uses, and
 * the service re-checks the order's state and the actor's permission. The band is drawn only when
 * `waiting || hasOperations`, so a settled order shows nothing rather than an empty panel promising
 * work that does not exist.
 */
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
      <div className={styles.actionBandHead}>
        <h2 className={styles.actionBandTitle} id="order-action-title">
          {waiting ? t('admin.order.decisionTitle') : t('admin.order.operationsTitle')}
        </h2>
        <div className={styles.actionBandTotal}>
          <span className={styles.factLabel}>{t('admin.cod.total')}</span>
          <span className={styles.recordPrice}>{price(order.totalMinor)}</span>
        </div>
        <p className={styles.actionBandBody}>
          {waiting ? t('admin.order.decisionBody') : t('admin.order.operationsBody')}
        </p>
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
                className={styles.actionConfirmEnd}
                reason={{
                  label: t('admin.cod.rejectReason'),
                  placeholder: t('admin.cod.rejectReasonPlaceholder'),
                  minLength: 10,
                  maxLength: 500,
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
              <form action={ORDER_TRANSITION_PATH} method="post" className={styles.approveForm}>
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="action" value="paid" />
                <input type="hidden" name="orderId" value={order.orderId} />
                <p className={styles.helper}>{t('admin.order.paidBody')}</p>
                <label className={styles.actionNoteLabel} htmlFor="collect-note">
                  {t('admin.order.paidNote')}
                </label>
                <input id="collect-note" name="note" className={styles.input} maxLength={300} />

                {canRecordCosts && (
                  <fieldset className={styles.costEntry}>
                    <legend className={styles.costLegend}>{t('admin.order.costsEntryTitle')}</legend>
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
                className={styles.actionConfirmEnd}
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
                className={styles.actionConfirmEnd}
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