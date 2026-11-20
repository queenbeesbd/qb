import type { TranslationKey } from '@/i18n/dictionaries';
import type { PillTone } from './StatusPill';

/**
 * The one status an order row states.
 *
 * The order carries separate state columns by design - fulfilment (`status`), prepaid payment, COD
 * (`cod_state`) - and a list that printed one of each showed the same fact twice: "Pending" beside
 * "Awaiting approval" is one order in one condition, and the owner read it as two (owner direction,
 * 2026-11-20). So a row states **one** state, in the coloured pill.
 *
 * **The COD state is folded in, not dropped.** `cod_pending_approval` and `cod_approved` are exactly
 * what `pending` and `confirmed` already mean for a COD order, so they add nothing. But
 * `cod_failed` is a fact the fulfilment status cannot carry: a failed delivery leaves the order
 * `shipped`, so dropping the payment line blindly would make a parcel that came back read as
 * "Shipped". That state therefore becomes the pill, in the danger tone.
 *
 * Every value is read off the row; nothing here infers a state the database does not hold.
 */
export function orderStatus(order: { status: string; codState?: string | null }): {
  readonly label: TranslationKey;
  readonly tone: PillTone;
} {
  if (order.status === 'cancelled') return { label: 'orders.status.cancelled', tone: 'danger' };
  if (order.status === 'returned') return { label: 'orders.status.returned', tone: 'danger' };
  // The one COD state the lifecycle status cannot express; `shipped` would be a false claim.
  if (order.codState === 'cod_failed' && order.status === 'shipped') {
    return { label: 'orders.cod.cod_failed', tone: 'danger' };
  }
  if (order.status === 'pending') return { label: 'orders.status.pending', tone: 'warning' };
  if (order.status === 'confirmed') return { label: 'orders.status.confirmed', tone: 'info' };
  if (order.status === 'processing') return { label: 'orders.status.processing', tone: 'info' };
  if (order.status === 'shipped') return { label: 'orders.status.shipped', tone: 'info' };
  if (order.status === 'delivered') return { label: 'orders.status.delivered', tone: 'success' };
  if (order.status === 'completed') return { label: 'orders.status.completed', tone: 'success' };
  // An unrecognised value degrades to a stated unknown rather than printing a raw column.
  return { label: 'orders.status.unknown', tone: 'neutral' };
}
