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
} from '@/server/auth/constants';
import { currentStaffPrincipal } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AdminShell } from '../_ui/AdminShell';
import type { AdminNavItem } from '../_ui/nav';

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

  // Grouped by the owner's actual work, not by database table: the confirmation queue is the first
  // commercial destination because it is the one that waits on a person. Each entry is gated by the
  // same permission its page requires, so the rail cannot advertise a refusal.
  const items: AdminNavItem[] = [
    { href: ADMIN_ROOT, labelKey: 'admin.nav.overview', group: 'overview', icon: 'overview' },
  ];
  if (hasPermission(principal, PERMISSIONS.orderRead)) {
    items.push({ href: COD_PATH, labelKey: 'admin.nav.cod', group: 'commerce', icon: 'orders' });
  }
  if (hasPermission(principal, PERMISSIONS.catalogWrite)) {
    items.push({ href: CATALOG_PATH, labelKey: 'admin.nav.catalog', group: 'commerce', icon: 'package' });
    items.push({ href: CATEGORIES_PATH, labelKey: 'admin.nav.categories', group: 'commerce', icon: 'categories' });
  }
  if (hasPermission(principal, PERMISSIONS.customerRead)) {
    items.push({ href: CUSTOMERS_PATH, labelKey: 'admin.nav.customers', group: 'customers', icon: 'customers' });
  }
  if (hasPermission(principal, PERMISSIONS.staffRead)) {
    items.push({ href: OWNERS_PATH, labelKey: 'admin.nav.owners', group: 'system', icon: 'owners' });
  }
  if (hasPermission(principal, PERMISSIONS.auditRead)) {
    items.push({ href: `${ADMIN_ROOT}/audit`, labelKey: 'admin.nav.audit', group: 'system', icon: 'audit' });
  }

  return (
    <AdminShell
      identity={{
        displayName: principal.displayName,
        email: principal.email,
        roleCodes: principal.roles.map((role) => role.code),
        csrfToken: principal.csrfToken,
      }}
      items={items}
    >
      {children}
    </AdminShell>
  );
}
