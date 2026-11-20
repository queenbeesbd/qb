import type { TranslationKey } from '@/i18n/dictionaries';
import type { AdminIconName } from './icons';

/**
 * One navigation destination.
 *
 * The list is built on the **server** from the session's effective permissions, so the client cannot
 * show a destination the request would refuse. Presentation only: every route re-checks its own
 * permission.
 */
export type AdminNavGroup =
  | 'overview'
  | 'commerce'
  | 'storefront'
  | 'customers'
  | 'settings'
  | 'system';

export type AdminNavItem = {
  href: string;
  labelKey: TranslationKey;
  group: AdminNavGroup;
  icon: AdminIconName;
  /**
   * Position (1-5) in the fixed bottom bar shown below 1024px, or absent when the destination belongs
   * only in the grouped rail and the Menu drawer.
   *
   * The bar answers a different question from the rail: the places the owner opens the panel for -
   * Overview, All orders, Products, Categories, Customers - so the ranking is explicit rather than
   * inherited from group order. It is applied to the permission-filtered list, so a bar can legitimately
   * be shorter than five and is never padded with a destination the session may not open.
   */
  mobileRank?: 1 | 2 | 3 | 4 | 5;
};
