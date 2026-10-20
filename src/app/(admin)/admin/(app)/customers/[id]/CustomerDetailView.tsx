'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { PageHeader } from '../../../_ui/PageHeader';
import { StatusPill } from '../../../_ui/StatusPill';
import styles from '../../../admin.module.css';

export type CustomerNotice = 'tokenIssued' | 'unavailable' | 'invalid' | 'denied';

type OrderRow = {
  orderId: number;
  orderNumber: string;
  placedAt: string;
  status: string;
  paymentMethod: string;
  codState: string;
  totalMinor: number;
};

type Customer = {
  customerId: number;
  email: string;
  displayName: string | null;
  status: string;
  createdAt: string;
  flagged: boolean;
  flagReason: string | null;
  /** Every order on record, so a capped list can state the difference. */
  orderTotal: number;
  orders: readonly OrderRow[] | null;
};

/**
 * Customer detail.
 *
 * Facts the database already holds, then the orders that already exist, then one destructive action
 * with its consequence written out. There is no lifetime-spend figure, no segment and no inferred
 * behaviour: those would be derived claims this phase has no mandate to publish.
 */
export function CustomerDetailView({
  customer,
  canSuspend,
  canResetCredential,
  canReadOrders,
  notice,
  issuedToken,
  csrfToken,
}: {
  customer: Customer;
  canSuspend: boolean;
  canResetCredential: boolean;
  canReadOrders: boolean;
  notice: CustomerNotice | null;
  /** Displayed once, on the render that follows issuance. Never stored, never linked. */
  issuedToken: { token: string; expiresAt: string } | null;
  csrfToken: string;
}) {
  const { t, locale, price } = useTranslation();
  const dateTimeFormat = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const dateFormat = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium' });
  const active = customer.status === 'active';

  return (
    <>
      <PageHeader
        eyebrow={t('admin.customers.detailEyebrow')}
        title={customer.displayName ?? customer.email}
        description={customer.email}
        actions={
          <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/admin/customers">
            {t('admin.customers.back')}
          </Link>
        }
      />

      {notice === 'tokenIssued' && issuedToken !== null && (
        <div className={styles.notice} role="status">
          <span>
            <strong>{t('admin.customers.recovery.tokenTitle')}.</strong>{' '}
            {t('admin.customers.recovery.tokenBody')}
          </span>
          <p className={styles.tokenValue} data-testid="recovery-code">
            {issuedToken.token}
          </p>
          <p className={styles.note}>
            {t('admin.customers.recovery.tokenExpires')}: {dateTimeFormat.format(new Date(issuedToken.expiresAt))}
          </p>
          {/* Discards the flash cookie now that the code has been rendered, so no reload can show it
              again. A page render may not clear a cookie itself in this version of Next.js. */}
          <form action="/api/admin/customers/recovery/dismiss" method="post" className={styles.inlineForm}>
            <input type="hidden" name="csrf" value={csrfToken} />
            <input type="hidden" name="customerId" value={customer.customerId} />
            <button className={`${styles.button} ${styles.buttonSecondary}`} type="submit">
              {t('admin.customers.recovery.dismiss')}
            </button>
          </form>
        </div>
      )}

      {notice !== null && notice !== 'tokenIssued' && (
        <div className={styles.notice} role="alert">
          <span>
            {notice === 'denied'
              ? t('admin.owners.notice.denied')
              : notice === 'invalid'
                ? t('admin.customers.recovery.reasonRequired')
                : t('admin.customers.recovery.unavailable')}
          </span>
        </div>
      )}

      {notice === 'tokenIssued' && issuedToken === null && (
        <div className={styles.notice}>
          <span>{t('admin.customers.recovery.tokenGone')}</span>
        </div>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>{t('admin.customers.ordersTitle')}</h2>
            {canReadOrders && <p>{t('admin.customers.ordersBody')}</p>}
          </div>
          {!canReadOrders ? (
            <div className={styles.notice}>
              <span>{t('admin.customers.ordersPermission')}</span>
            </div>
          ) : customer.orders === null || customer.orders.length === 0 ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>{t('admin.customers.noOrdersTitle')}</h3>
              <p className={styles.emptyBody}>{t('admin.customers.noOrdersBody')}</p>
            </div>
          ) : (
            <ul className={styles.recordList}>
              {customer.orders.map((order) => (
                <li className={styles.record} key={order.orderId}>
                  <span className={styles.recordThumb} aria-hidden="true">
                    {order.paymentMethod === 'cod' ? 'C' : 'P'}
                  </span>
                  <div className={styles.recordMain}>
                    <span className={styles.recordTitle}>
                      <Link
                        className={styles.recordLink}
                        href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                      >
                        <span className={styles.mono}>{order.orderNumber}</span>
                      </Link>
                    </span>
                    <span className={styles.recordMeta}>
                      <span>{dateTimeFormat.format(new Date(order.placedAt))}</span>
                      <span>{t(paymentLabel(order.paymentMethod, '', order.codState))}</span>
                    </span>
                  </div>
                  <div className={styles.recordSide}>
                    <StatusPill
                      tone={
                        order.status === 'cancelled'
                          ? 'danger'
                          : order.status === 'pending'
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {t(statusLabel(order.status))}
                    </StatusPill>
                    <span className={styles.recordPrice}>{price(order.totalMinor)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* The list is capped at 50 rows, so it must say when there are more rather than ending silently. */}
          {canReadOrders && customer.orders !== null && customer.orderTotal > customer.orders.length && (
            <p className={styles.note}>
              {t('admin.customers.ordersTruncated', {
                shown: customer.orders.length,
                total: customer.orderTotal,
              })}
            </p>
          )}
        </div>

        <aside className={styles.section}>
          <div className={styles.panel}>
            <div className={styles.factGrid}>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('admin.customers.status')}</span>
                <span>
                  <StatusPill tone={active ? 'success' : 'danger'}>
                    {active ? t('admin.customers.active') : t('admin.customers.suspended')}
                  </StatusPill>
                </span>
              </div>
              <div className={styles.fact}>
                <span className={styles.factLabel}>{t('admin.customers.joined')}</span>
                <span className={styles.factValue}>{dateFormat.format(new Date(customer.createdAt))}</span>
              </div>
            </div>

            {customer.flagged && (
              <div className={styles.notice} style={{ marginTop: 'var(--space-4)' }}>
                <span>
                  <strong>{t('admin.customers.flagged')}.</strong>{' '}
                  {customer.flagReason ?? t('admin.customers.flaggedNoReason')}
                </span>
              </div>
            )}
          </div>

          {active && canSuspend && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{t('admin.customers.suspendTitle')}</h2>
              <p className={styles.note} style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
                {t('admin.customers.suspendBody')}
              </p>
              <ConfirmSubmit
                action="/api/admin/customers"
                csrfToken={csrfToken}
                fields={{ customerId: customer.customerId }}
                triggerLabel={t('admin.customers.suspend')}
                triggerVariant="danger"
                small={false}
                title={t('admin.customers.suspendTitle')}
                body={t('admin.customers.suspendBody')}
                confirmLabel={t('admin.customers.suspend')}
                cancelLabel={t('admin.common.cancel')}
                pendingLabel={t('admin.common.working')}
                reason={{
                  label: t('admin.customers.reasonLabel'),
                  placeholder: t('admin.customers.reasonPlaceholder'),
                  minLength: 10,
                  maxLength: 500,
                  required: true,
                }}
              />
            </div>
          )}

          {active && canResetCredential && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>{t('admin.customers.recovery.title')}</h2>
              <p className={styles.note} style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
                {t('admin.customers.recovery.body')}
              </p>
              <form action="/api/admin/customers/recovery" method="post">
                <input type="hidden" name="csrf" value={csrfToken} />
                <input type="hidden" name="customerId" value={customer.customerId} />
                <label className={styles.field}>
                  <span>{t('admin.customers.recovery.reasonLabel')}</span>
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={500}
                    rows={3}
                    placeholder={t('admin.customers.recovery.reasonPlaceholder')}
                  />
                </label>
                <button className={`${styles.button} ${styles.buttonSecondary}`} type="submit">
                  {t('admin.customers.recovery.submit')}
                </button>
              </form>
              <p className={styles.note} style={{ marginTop: 'var(--space-3)' }}>
                {t('admin.customers.recovery.consequence')}
              </p>
            </div>
          )}

          {!active && <p className={styles.note}>{t('admin.customers.suspendedNote')}</p>}
        </aside>
      </div>
    </>
  );
}
