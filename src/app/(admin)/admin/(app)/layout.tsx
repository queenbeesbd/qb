import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  ADMIN_ROOT,
  CATALOG_PATH,
  CATEGORIES_PATH,
  COD_PATH,
  CUSTOMERS_PATH,
  LOGIN_PATH,
  OWNERS_PATH,
  PAYMENTS_PATH,
  RECIPIENTS_PATH,
} from '@/server/auth/constants';
import { currentStaffPrincipal } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AdminHeader } from './AdminHeader';
import type { AdminNavItem } from './AdminNav';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Admin',
  // The admin surface is never indexed, whatever the deployment target.
  robots: { index: false, follow: false },
};

/**
 * The authenticated admin shell.
 *
 * This layout enforces exactly one thing - **there is a session** - and nothing else. Each page
 * enforces its own permission, so a page added later cannot inherit a capability from this layout,
 * while the navigation is filtered by the same permission set the pages check.
 *
 * The whole admin tree is dynamic: it reads a session cookie, so it must never be prerendered or
 * cached. `dynamic` is declared rather than inferred, because a cached admin response would be a
 * cross-account data leak.
 */
export const dynamic = 'force-dynamic';

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const principal = await currentStaffPrincipal();
  if (principal === null) redirect(LOGIN_PATH);

  const items: AdminNavItem[] = [{ href: ADMIN_ROOT, labelKey: 'admin.nav.overview' }];
  if (hasPermission(principal, PERMISSIONS.catalogWrite)) {
    items.push({ href: CATALOG_PATH, labelKey: 'admin.nav.catalog' });
    items.push({ href: CATEGORIES_PATH, labelKey: 'admin.nav.categories' });
  }
  if (hasPermission(principal, PERMISSIONS.staffRead)) {
    items.push({ href: OWNERS_PATH, labelKey: 'admin.nav.owners' });
  }
  if (hasPermission(principal, PERMISSIONS.orderRead)) {
    items.push({ href: PAYMENTS_PATH, labelKey: 'admin.nav.payments' });
    items.push({ href: COD_PATH, labelKey: 'admin.nav.cod' });
    items.push({ href: CUSTOMERS_PATH, labelKey: 'admin.nav.customers' });
  }
  // The recipient screen configures where a prepaid method's money must arrive. It is its own
  // permission (`payment.recipient_manage`), not `order.read`, because reading an order is not the
  // same capability as redirecting the account customers are told to pay into.
  if (hasPermission(principal, PERMISSIONS.paymentRecipientManage)) {
    items.push({ href: RECIPIENTS_PATH, labelKey: 'admin.nav.paymentRecipients' });
  }
  if (hasPermission(principal, PERMISSIONS.auditRead)) {
    items.push({ href: `${ADMIN_ROOT}/audit`, labelKey: 'admin.nav.audit' });
  }

  return (
    <div className={styles.page}>
      <AdminHeader
        identity={{
          displayName: principal.displayName,
          roleCodes: principal.roles.map((role) => role.code),
          csrfToken: principal.csrfToken,
        }}
        items={items}
      />
      <main id="admin-main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
