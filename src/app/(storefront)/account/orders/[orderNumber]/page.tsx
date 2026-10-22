import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withTransaction } from '@/db/client';
import { OrderDetailView, type OrderDetail } from '@/features/account/OrderDetailView';
import { cookies } from 'next/headers';

import { CUSTOMER_ORDERS_PATH, CUSTOMER_SESSION_COOKIE } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';
import { getCustomerOrderDetail, getGuestOrderDetail } from '@/server/orders/read';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * One of the customer's own orders, or the not-found surface.
 *
 * Another customer's order number is not "forbidden" - it is simply not a row this query can return. The
 * page confirms nothing about whether the order exists.
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  /*
   * A guest order is read by its own number, and only a **guest** order: the query refuses an order that
   * belongs to an account, so a customer's order number is not a key to somebody else's page. Without a
   * session cookie there is nothing to sign in with, so a guest goes straight to their confirmation.
   */
  const sessionCookie = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const anonymous = sessionCookie === undefined || sessionCookie === '';
  const detail = anonymous
    ? await withTransaction((tx) => getGuestOrderDetail(tx, orderNumber))
    : await (async () => {
        const principal = await requireCustomerPage(`${CUSTOMER_ORDERS_PATH}/${orderNumber}`);
        return withTransaction((tx) => getCustomerOrderDetail(tx, principal.customerId, orderNumber));
      })();
  if (detail === null) notFound();

  const order: OrderDetail = {
    orderNumber: detail.orderNumber,
    status: detail.status,
    paymentState: detail.paymentState,
    codState: detail.codState,
    paymentMethod: detail.paymentMethod,
    totalMinor: detail.totalMinor,
    itemsSubtotalMinor: detail.itemsSubtotalMinor,
    shippingMinor: detail.shippingMinor,
    placedAt: detail.placedAt.toISOString(),
    recipientName: detail.contact.recipientName,
    districtCode: detail.contact.districtCode,
    recipientPhone: detail.contact.recipientPhone,
    addressLine: detail.contact.addressLine,
    area: detail.contact.area,
    city: detail.contact.city,
    postcode: detail.contact.postcode,
    deliveryNote: detail.contact.deliveryNote,
    items: detail.items.map((item) => ({
      // The English name is required on every product, so it is the name the customer reads. The
      // Bangla snapshot is optional and is never needed as a fallback.
      name: item.productNameEn,
      sku: item.sku,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };

  return <OrderDetailView order={order} placed={query.placed === '1'} />;
}
