import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { withTransaction } from '@/db/client';
import { OrderDetailView, type OrderDetail } from '@/features/account/OrderDetailView';
import { currentCustomerPrincipal } from '@/server/customer-auth/guard';
import { getCustomerOrderDetail, getGuestOrderDetail } from '@/server/orders/read';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * One order's receipt - the canonical route for **both** viewers.
 *
 * **Anonymous means "no resolved session", not "no cookie".** The page used to branch on the cookie's
 * presence, so a guest whose browser still held an expired or revoked session was treated as a
 * customer, redirected to sign in, and could not see the order they had just placed. Now the principal
 * is resolved exactly as every other page resolves it, and a cookie that resolves to nothing is a
 * guest.
 *
 * **What a guest may read is still the database's decision.** `getGuestOrderDetail` matches
 * `customer_id is null`, so a customer's order number is a 404 for anyone without that customer's
 * session; `getCustomerOrderDetail` filters on the session's own id, so it cannot return a guest order
 * or another customer's. Neither read takes an order number alone.
 *
 * **A signed-in customer may see a guest order - to claim it, not to keep it (ADR 0032).** The order
 * they just placed without an account is a 404 if this page only asked for their own rows, so the
 * read falls back to the guest read and marks the order `claimable`. Seeing it grants nothing: the
 * guest read is the same one an anonymous visitor with the number gets, and the claim itself is an
 * explicit action that links the order to this account once.
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
  const principal = await currentCustomerPrincipal();

  const resolved = await withTransaction(async (tx) => {
    if (principal === null) {
      const detail = await getGuestOrderDetail(tx, orderNumber);
      return detail === null ? null : { detail, claimable: false };
    }
    const own = await getCustomerOrderDetail(tx, principal.customerId, orderNumber);
    if (own !== null) return { detail: own, claimable: false };
    const guest = await getGuestOrderDetail(tx, orderNumber);
    return guest === null ? null : { detail: guest, claimable: true };
  });
  if (resolved === null) notFound();

  const { detail, claimable } = resolved;

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

  return (
    <OrderDetailView
      order={order}
      placed={query.placed === '1'}
      guest={principal === null}
      claimable={claimable}
      claimed={query.claim === 'claimed'}
      csrfToken={principal?.csrfToken ?? null}
    />
  );
}
