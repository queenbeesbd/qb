import type { Metadata } from 'next';

import { withTransaction } from '@/db/client';
import { AccountFrame } from '@/features/account/dashboard/AccountFrame';
import { AccountOverview } from '@/features/account/dashboard/AccountOverview';
import { toDashboardOrder } from '@/features/account/dashboard/map-order';
import { ACCOUNT_ROOT } from '@/server/customer-auth/constants';
import { requireCustomerPage } from '@/server/customer-auth/guard';
import { readCustomerProfile } from '@/server/customer-auth/profile';
import { listCustomerOrders } from '@/server/orders/read';

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The account dashboard.
 *
 * Signed out, `requireCustomerPage` redirects to sign-in with this path as the return - a dashboard
 * that rendered its own "you are not signed in" panel put an extra decision in front of a screen that
 * has nothing to show.
 *
 * The session supplies the identity; the orders and the account row are read in one transaction and
 * filtered by the session's `customer_id` in SQL. Only serialisable values cross to the views.
 */
export default async function AccountPage() {
  const principal = await requireCustomerPage(ACCOUNT_ROOT);
  const { orders, profile } = await withTransaction(async (tx) => ({
    orders: await listCustomerOrders(tx, principal.customerId),
    profile: await readCustomerProfile(tx, principal.customerId),
  }));

  return (
    <AccountFrame
      customer={{ email: principal.email, displayName: principal.displayName }}
      csrfToken={principal.csrfToken}
      active="overview"
    >
      <AccountOverview
        customer={{
          email: principal.email,
          displayName: principal.displayName,
          memberSince: profile.createdAt?.toISOString() ?? null,
        }}
        orders={orders.map(toDashboardOrder)}
      />
    </AccountFrame>
  );
}
