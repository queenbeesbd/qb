import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { orderReceiptPath } from '@/lib/order-paths';

export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The old receipt address, kept only so a link already in a customer's browser history keeps working.
 *
 * Receipts moved to `/orders/<number>` because every order has one - a guest had no account tree to
 * live in - and because the old page decided "anonymous" from the presence of a session cookie rather
 * than from a resolved session (see `/orders/[orderNumber]`).
 *
 * A permanent redirect, not an alias: two URLs rendering the same receipt is two places to disagree
 * about which page a customer is on. The `placed` marker travels with it.
 */
export default async function LegacyOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  redirect(orderReceiptPath(orderNumber, { placed: query.placed === '1' }));
}
