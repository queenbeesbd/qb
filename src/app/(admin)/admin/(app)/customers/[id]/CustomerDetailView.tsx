'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { paymentLabel, statusLabel } from '@/features/account/order-labels';
import { ConfirmSubmit } from '../../../_ui/ConfirmSubmit';
import { PageHeader } from '../../../_ui/PageHeader';
import { StatusPill } from '../../../_ui/StatusPill';
import styles from '../../../admin.module.css';

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
  canReadOrders,
  csrfToken,
}: {
  customer: Customer;
  canSuspend: boolean;
  canReadOrders: boolean;
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
                      <span className={styles.mono}>{order.orderNumber}</span>
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

          {!active && <p className={styles.note}>{t('admin.customers.suspendedNote')}</p>}
        </aside>
      </div>
    </>
  );
}
