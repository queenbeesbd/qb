import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withTransaction } from '@/db/client';
import { OrderDetailView, type OrderDetail } from '@/features/account/OrderDetailView';
import { CUSTOMER_ORDERS_PATH } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';
import { getCustomerOrderDetail } from '@/server/orders/read';

export const metadata: Metadata = { title: 'অর্ডার', robots: { index: false, follow: false } };
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
  const principal = await requireCustomerPage(`${CUSTOMER_ORDERS_PATH}/${orderNumber}`);

  const detail = await withTransaction((tx) =>
    getCustomerOrderDetail(tx, principal.customerId, orderNumber),
  );
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
      name: item.productNameEn || item.productNameBn,
      sku: item.sku,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };

  return <OrderDetailView order={order} placed={query.placed === '1'} />;
}
