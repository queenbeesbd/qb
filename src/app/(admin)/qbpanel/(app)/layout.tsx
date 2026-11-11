import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  ADMIN_ROOT,
  ANALYTICS_PATH,
  BRANDS_PATH,
  CATALOG_PATH,
  CATEGORIES_PATH,
  COD_PATH,
  CUSTOMERS_PATH,
  ANNOUNCEMENT_SETTINGS_PATH,
  CONTACT_SETTINGS_PATH,
  DELIVERY_SETTINGS_PATH,
  STOREFRONT_HERO_PATH,
  STOREFRONT_PATH,
  INTEGRATIONS_PATH,
  LOGIN_PATH,
  OFFER_POPUP_SETTINGS_PATH,
  OTHER_SETTINGS_PATH,
  ORDERS_PATH,
  OWNERS_PATH,
  PROMO_CODES_PATH,
  REVIEWS_PATH,
  TRAFFIC_PATH,
  SUPPORT_SETTINGS_PATH,
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
    // Directly under Analitics in the same group: the shop's own readers, as a fact of their own.
    items.push({ href: TRAFFIC_PATH, labelKey: 'admin.nav.traffic', group: 'overview', icon: 'overview' });
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
    // Brands are a destination because each one now carries the logo the storefront draws.
    items.push({ href: BRANDS_PATH, labelKey: 'admin.nav.brands', group: 'commerce', icon: 'image' });
  }
  if (hasPermission(principal, PERMISSIONS.settingsWrite)) {
    items.push({ href: PROMO_CODES_PATH, labelKey: 'admin.nav.promo', group: 'commerce', icon: 'tag' });
  }
  if (hasPermission(principal, PERMISSIONS.reviewModerate)) {
    // A worklist beside the other queues: a customer's words wait here until the owner publishes them.
    items.push({ href: REVIEWS_PATH, labelKey: 'admin.nav.reviews', group: 'commerce', icon: 'list' });
  }
  if (hasPermission(principal, PERMISSIONS.settingsWrite)) {
    /*
     * Storefront is its own division rather than another Settings row (owner direction, 2026-11-12):
     * what the homepage shows is merchandising, the same work as the catalog, and the hero carousel
     * moved here so every decision that shapes the shop's front page sits in one place.
     */
    items.push({
      href: STOREFRONT_PATH,
      labelKey: 'admin.nav.storefrontCustomisation',
      group: 'storefront',
      icon: 'image',
    });
    items.push({
      href: STOREFRONT_HERO_PATH,
      labelKey: 'admin.nav.hero',
      group: 'storefront',
      icon: 'image',
    });
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
    // The two floating support buttons' addresses: the shop's own Facebook and WhatsApp.
    items.push({
      href: SUPPORT_SETTINGS_PATH,
      labelKey: 'admin.nav.support',
      group: 'settings',
      icon: 'bell',
    });
    // The facts the shop publishes about itself - phone, hours, address - and its policy text.
    items.push({
      href: CONTACT_SETTINGS_PATH,
      labelKey: 'admin.nav.contact',
      group: 'settings',
      icon: 'list',
    });
    // The image a visitor meets when the storefront opens: one image and one switch.
    items.push({
      href: OFFER_POPUP_SETTINGS_PATH,
      labelKey: 'admin.nav.offerPopup',
      group: 'settings',
      icon: 'bell',
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
