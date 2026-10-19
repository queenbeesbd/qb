import type { TranslationKey } from '@/i18n/dictionaries';
import type { AdminIconName } from './icons';

/**
 * One navigation destination.
 *
 * The list is built on the **server** from the session's effective permissions, so the client cannot
 * show a destination the request would refuse. Presentation only: every route re-checks its own
 * permission.
 */
export type AdminNavGroup = 'overview' | 'commerce' | 'customers' | 'system';

export type AdminNavItem = {
  href: string;
  labelKey: TranslationKey;
  group: AdminNavGroup;
  icon: AdminIconName;
};
