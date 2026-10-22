import type { TranslationKey } from '@/i18n/dictionaries';
import type { AdminIconName } from './icons';

/**
 * One navigation destination.
 *
 * The list is built on the **server** from the session's effective permissions, so the client cannot
 * show a destination the request would refuse. Presentation only: every route re-checks its own
 * permission.
 */
export type AdminNavGroup = 'overview' | 'commerce' | 'customers' | 'settings' | 'system';

export type AdminNavItem = {
  href: string;
  labelKey: TranslationKey;
  group: AdminNavGroup;
  icon: AdminIconName;
  /**
   * Position in the phone bottom bar (1-4), or absent when the destination belongs only in the
   * rail and the More sheet. Ranked explicitly rather than by sidebar order because the phone is
   * used for a different first move: decide the queue, then check stock, then look up an order.
   */
  mobileRank?: 1 | 2 | 3 | 4;
};
