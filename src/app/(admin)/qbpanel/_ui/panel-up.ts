/**
 * Where "back" means, in the panel.
 *
 * The panel is a web application inside a phone shell, so it cannot rely on the browser's history
 * stack alone: a cold start on a deep page (a bookmark, an APK launch, a shared link) has **no**
 * previous entry, and the browser or the Android gesture then leaves the site or closes the app
 * (owner report, 2026-11-12). Every page therefore has a defined parent route, derived from the path
 * itself, and the shell draws it as a real link.
 *
 * The rule is "one level up the panel's own tree", never "the page the shopper came from": a parent is
 * a fact about where a page sits, while a history entry may be another site entirely.
 *
 * Pure and total: an unknown path resolves to the panel root, and the root itself has no parent.
 */

const ROOT = '/qbpanel';

/**
 * The tree the panel is laid out in: a section, then a record or a page one level down.
 *
 * A `Record` rather than a `Set` because this is a fixed, static list of string keys - the same shape
 * the rest of the panel uses for a closed set.
 */
const SECTIONS: Record<string, true> = {
  settings: true,
  catalog: true,
  categories: true,
  orders: true,
  'orders-cod': true,
  customers: true,
  'promo-codes': true,
  reviews: true,
  owners: true,
  audit: true,
  analytics: true,
  traffic: true,
  storefront: true,
  forbidden: true,
};

/**
 * The parent of a panel path, or `null` at the root.
 *
 * - `/qbpanel/catalog/new` -> `/qbpanel/catalog` (an editor returns to its list)
 * - `/qbpanel/catalog/7` -> `/qbpanel/catalog`
 * - `/qbpanel/orders/QB1` -> `/qbpanel/orders`
 * - `/qbpanel/settings/integrations/telegram` -> `/qbpanel/settings/integrations`
 * - `/qbpanel/settings/hero` (retired) -> `/qbpanel/settings`
 * - `/qbpanel/catalog` -> `/qbpanel`
 */
export function panelParent(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0] ?? '';
  const segments = path.split('/').filter((segment) => segment.length > 0);
  // Anything outside the panel tree has no parent here; the shell is only drawn inside it.
  if (segments[0] !== 'qbpanel') return null;
  if (segments.length === 1) return null;

  const rest = segments.slice(1);

  /*
   * A section's own child is either a record (`/orders/QB1`) or a page (`/settings/delivery`). Both
   * return to the section root, which is where the list or the hub lives.
   */
  if (rest.length === 2) {
    return SECTIONS[rest[0] ?? ''] === true ? `${ROOT}/${rest[0]}` : ROOT;
  }

  // Deeper: drop one segment, so `settings/integrations/telegram` -> `settings/integrations`, and
  // `catalog/brands/new` -> `catalog/brands`.
  return `${ROOT}/${rest.slice(0, -1).join('/')}`;
}
