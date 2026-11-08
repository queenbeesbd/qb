import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { statusLabel } from '@/features/account/order-labels';
import { INTL_LOCALE, translate } from '@/i18n/config';
import { deliveryAreaName } from '@/lib/delivery-areas';
import { formatMoney, orderDiscountMinor } from '@/lib/money';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { adminOrderDetail } from '@/server/orders/qbpanel-order';
import { SlipActions } from './SlipActions';
import styles from './slip.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dispatch slip', robots: { index: false, follow: false } };

/** The shop's clock, the same one the dashboard buckets by. A courier reads a Dhaka time. */
const dateTime = new Intl.DateTimeFormat(INTL_LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Dhaka',
});

/**
 * The dispatch slip - the paper that travels with the parcel.
 *
 * **Presentation only.** It reads one order and writes nothing: no state change, no event, no audit
 * row, and it never prints the booking internally (no order id, customer email, account state,
 * payment state or cost). What it carries is what a courier or the receiver needs: the reference, the
 * recipient, the address, the lines and quantities, and the amount to collect.
 *
 * It lives outside the `(app)` group on purpose, so the shell's rail, tab bar and page chrome are not
 * part of the document - nothing has to be hidden with print CSS for the paper to be clean.
 *
 * There is **no shop contact block**, because the shop has no stored phone or address (Settings holds
 * the two support links and nothing else of that kind). The gap is stated on screen and nothing is
 * invented for the paper.
 */
export default async function DispatchSlipPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  await requireAdminPage(PERMISSIONS.orderRead);
  const { orderNumber } = await params;
  // The reference is a bounded opaque token; anything longer cannot be one this application issued.
  const reference = orderNumber.slice(0, 64);

  const detail = await withTransaction(async (tx) => adminOrderDetail(tx, reference));
  if (detail === null) notFound();

  const discount = orderDiscountMinor(detail.itemsSubtotalMinor, detail.shippingMinor, detail.totalMinor);
  const district =
    detail.contact.districtCode === null ? null : deliveryAreaName(detail.contact.districtCode);
  const address = [
    detail.contact.addressLine,
    district,
    detail.contact.area,
    detail.contact.city,
  ]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(', ');
  const postcode =
    detail.contact.postcode === null || detail.contact.postcode.trim() === ''
      ? ''
      : ' ' + detail.contact.postcode;

  return (
    <main className={styles.page}>
      <div className={styles.screenOnly}>
        <SlipActions orderHref={'/qbpanel/orders/' + detail.orderNumber} />
        <p className={styles.contactGap}>{translate('admin.slip.contactGap')}</p>
      </div>

      <article className={styles.slip}>
        <header className={styles.head}>
          <p className={styles.shop}>{translate('admin.slip.shopName')}</p>
          <h1 className={styles.title}>{translate('admin.slip.title')}</h1>
        </header>

        <dl className={styles.meta}>
          <div>
            <dt>{translate('admin.slip.orderLabel')}</dt>
            <dd className={styles.mono}>{detail.orderNumber}</dd>
          </div>
          <div>
            <dt>{translate('admin.slip.placedLabel')}</dt>
            <dd>{dateTime.format(detail.placedAt)}</dd>
          </div>
          <div>
            <dt>{translate('admin.slip.statusLabel')}</dt>
            <dd>{translate(statusLabel(detail.status))}</dd>
          </div>
        </dl>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{translate('admin.slip.deliverTo')}</h2>
          <p className={styles.name}>{detail.contact.recipientName}</p>
          <p className={styles.phone}>{detail.contact.recipientPhone}</p>
          <p className={styles.address}>
            {address}
            {postcode}
          </p>
          {detail.contact.deliveryNote !== null && detail.contact.deliveryNote.trim() !== '' && (
            <p className={styles.note}>
              {translate('admin.slip.customerNote', { note: detail.contact.deliveryNote })}
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{translate('admin.slip.itemsTitle')}</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{translate('admin.slip.itemColumn')}</th>
                <th scope="col" className={styles.num}>
                  {translate('admin.slip.quantityColumn')}
                </th>
                <th scope="col" className={[styles.num, styles.priceColumn].join(' ')}>
                  {translate('admin.slip.priceColumn')}
                </th>
                <th scope="col" className={styles.num}>
                  {translate('admin.slip.amountColumn')}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id} className={styles.itemRow}>
                  <th scope="row" className={styles.itemCell}>
                    <span className={styles.itemName}>{item.nameEn}</span>
                    {item.variantLabel !== null && (
                      <span className={styles.variant}>{item.variantLabel}</span>
                    )}
                  </th>
                  <td className={styles.num}>{item.quantity}</td>
                  <td className={[styles.num, styles.priceColumn].join(' ')}>
                    {formatMoney(item.unitPriceMinor)}
                  </td>
                  <td className={styles.num}>{formatMoney(item.lineTotalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className={styles.totals}>
            <div>
              <dt>{translate('admin.slip.subtotal')}</dt>
              <dd>{formatMoney(detail.itemsSubtotalMinor)}</dd>
            </div>
            {discount > 0 && (
              <div>
                <dt>{translate('admin.slip.discount')}</dt>
                <dd>{'-' + formatMoney(discount)}</dd>
              </div>
            )}
            <div>
              <dt>{translate('admin.slip.delivery')}</dt>
              <dd>{formatMoney(detail.shippingMinor)}</dd>
            </div>
            <div className={styles.collect}>
              <dt>{translate('admin.slip.collect')}</dt>
              <dd>{formatMoney(detail.totalMinor)}</dd>
            </div>
          </dl>
        </section>
      </article>
    </main>
  );
}
