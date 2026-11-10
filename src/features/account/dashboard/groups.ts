import type { TranslationKey } from '@/i18n/dictionaries';

import { isOpenOrder } from './progress';
import type { DashboardOrder } from './types';

/**
 * The four groups an order list can be read in.
 *
 * They are exhaustive and never overlap, so the four counts add up to the account's order count - a
 * reader can check that they do. Kept out of the client view because the **server** page validates the
 * `?state=` value against this same closed set before handing it down; a value outside it falls back
 * to "all" rather than shaping an empty screen of its own.
 */
export const ORDER_GROUPS = [
  { id: 'all', label: 'account.filter.all', match: () => true },
  {
    id: 'open',
    label: 'account.filter.open',
    match: (order: DashboardOrder) => isOpenOrder(order.status) && order.status !== 'delivered',
  },
  {
    id: 'delivered',
    label: 'account.filter.delivered',
    match: (order: DashboardOrder) => order.status === 'delivered' || order.status === 'completed',
  },
  {
    id: 'closed',
    label: 'account.filter.closed',
    match: (order: DashboardOrder) => order.status === 'cancelled' || order.status === 'returned',
  },
] as const satisfies readonly {
  id: string;
  label: TranslationKey;
  match: (order: DashboardOrder) => boolean;
}[];

export type OrderGroup = (typeof ORDER_GROUPS)[number]['id'];

export function isOrderGroup(value: string | undefined): value is OrderGroup {
  return ORDER_GROUPS.some((group) => group.id === value);
}
