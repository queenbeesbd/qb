import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  ADMIN_ROOT,
  ANALYTICS_PATH,
  CATALOG_PATH,
  CATEGORIES_PATH,
  COD_PATH,
  CUSTOMERS_PATH,
  ANNOUNCEMENT_SETTINGS_PATH,
  DELIVERY_SETTINGS_PATH,
  INTEGRATIONS_PATH,
  LOGIN_PATH,
  OTHER_SETTINGS_PATH,
  ORDERS_PATH,
  OWNERS_PATH,
  PROMO_CODES_PATH,
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
    {
      href: ADMIN_ROOT,
      labelKey: 'admin.nav.overview',
      group: 'overview',
      icon: 'overview',
      mobileRank: 1,
    },
  ];
  if (hasPermission(principal, PERMISSIONS.orderRead)) {
    items.push({ href: ANALYTICS_PATH, labelKey: 'admin.nav.analytics', group: 'overview', icon: 'analytics' });
    items.push({
      href: COD_PATH,
      labelKey: 'admin.nav.cod',
      group: 'commerce',
      icon: 'orders',
      mobileRank: 2,
    });
    items.push({
      href: ORDERS_PATH,
      labelKey: 'admin.nav.orders',
      group: 'commerce',
      icon: 'list',
      mobileRank: 4,
    });
  }
  if (hasPermission(principal, PERMISSIONS.catalogWrite)) {
    items.push({
      href: CATALOG_PATH,
      labelKey: 'admin.nav.catalog',
      group: 'commerce',
      icon: 'package',
      mobileRank: 3,
    });
    items.push({ href: CATEGORIES_PATH, labelKey: 'admin.nav.categories', group: 'commerce', icon: 'categories' });
  }
  if (hasPermission(principal, PERMISSIONS.settingsWrite)) {
    items.push({ href: PROMO_CODES_PATH, labelKey: 'admin.nav.promo', group: 'commerce', icon: 'tag' });
  }
  if (hasPermission(principal, PERMISSIONS.customerRead)) {
    items.push({ href: CUSTOMERS_PATH, labelKey: 'admin.nav.customers', group: 'customers', icon: 'customers' });
  }
  if (hasPermission(principal, PERMISSIONS.settingsWrite)) {
    items.push({
      href: DELIVERY_SETTINGS_PATH,
      labelKey: 'admin.nav.delivery',
      group: 'settings',
      icon: 'settings',
    });
    items.push({
      href: ANNOUNCEMENT_SETTINGS_PATH,
      labelKey: 'admin.nav.announcement',
      group: 'settings',
      icon: 'list',
    });
    // Integrations is a hub, so the sidebar gains one entry however many providers exist later.
    items.push({
      href: INTEGRATIONS_PATH,
      labelKey: 'admin.nav.integrations',
      group: 'settings',
      icon: 'bell',
    });
    // Store policy that is not a rendered value: today, whether guests may order.
    items.push({
      href: OTHER_SETTINGS_PATH,
      labelKey: 'admin.nav.otherSettings',
      group: 'settings',
      icon: 'settings',
    });
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
