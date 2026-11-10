import type { TranslationKey } from '@/i18n/dictionaries';

/**
 * How far an order has travelled, derived from the stored state - never guessed.
 *
 * The shop's order carries several separate state columns by design (fulfilment, prepaid payment and
 * COD). This module reads the two that decide where a parcel is in the customer's hands:
 * `order.status` for the movement, and `order.cod_state` for whether the owner has approved the cash
 * order yet. It invents nothing: a step is reached only because a stored value says so, and a
 * cancelled or returned order draws no track at all, because it has no next step to promise.
 *
 * Pure and dependency-free so the same derivation can be tested without a database.
 */

export type StepState = 'done' | 'current' | 'future';

export type OrderProgress = {
  /** Five marks, in order: placed, confirmed, dispatched, delivered, cash received. */
  readonly steps: readonly { readonly key: TranslationKey; readonly state: StepState }[];
  /** The one sentence a customer needs next; a stored fact, not a promise. */
  readonly nextKey: TranslationKey;
  /** True for cancelled and returned orders, which draw no track. */
  readonly terminal: boolean;
};

const TRACK: readonly { key: TranslationKey; step: string }[] = [
  { key: 'account.step.placed', step: 'placed' },
  { key: 'account.step.confirmed', step: 'confirmed' },
  { key: 'account.step.dispatched', step: 'dispatched' },
  { key: 'account.step.delivered', step: 'delivered' },
  { key: 'account.step.paid', step: 'paid' },
];

/** How many of the five marks a stored state has reached, and which one it rests on. */
function reachedIndex(status: string): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'confirmed':
    case 'processing':
      return 1;
    case 'shipped':
      return 2;
    case 'delivered':
      return 3;
    case 'completed':
      return 4;
    default:
      // An unrecognised state cannot claim progress; it rests on the first mark.
      return 0;
  }
}

/**
 * The sentence under the order number.
 *
 * Every branch is a statement about a stored value. A dispatched order is not called delivered, a
 * cancelled order says nothing about a refund (a refund is a separate fact the platform does not
 * hold), and cash is only described as received once the shop recorded the collection.
 */
export function nextStepKey(order: {
  status: string;
  codState: string;
  paymentMethod: string;
}): TranslationKey {
  if (order.status === 'cancelled') return 'orders.next.cancelled';
  if (order.status === 'returned') return 'orders.next.returned';
  if (order.paymentMethod === 'cod') {
    if (order.codState === 'cod_pending_approval') return 'orders.next.codAwaitingApproval';
    if (order.codState === 'cod_failed') return 'orders.next.codFailed';
  }
  if (order.status === 'pending') return 'orders.next.reviewing';
  if (order.status === 'shipped') return 'orders.next.dispatched';
  if (order.status === 'delivered') return 'orders.next.delivered';
  if (order.status === 'completed') return 'orders.next.completed';
  if (order.codState === 'cod_collected') return 'orders.next.cashReceived';
  return 'orders.next.confirmed';
}

export function orderProgress(order: { status: string; codState: string; paymentMethod: string }): OrderProgress {
  const terminal = order.status === 'cancelled' || order.status === 'returned';
  const reached = reachedIndex(order.status);

  // A COD order the owner has not approved yet has not reached \"confirmed\" however the row reads;
  // the shop phones first, so the second mark stays unreached.
  const effective =
    !terminal && order.paymentMethod === 'cod' && order.codState === 'cod_pending_approval'
      ? Math.min(reached, 0)
      : reached;

  return {
    steps: TRACK.map((entry, index) => ({
      key: entry.key,
      state:
        terminal || index > effective
          ? 'future'
          : index === effective
            ? 'current'
            : 'done',
    })),
    nextKey: nextStepKey(order),
    terminal,
  };
}

/** The stored states that no longer move: money is settled or the order is closed. */
export function isOpenOrder(status: string): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'processing' || status === 'shipped' || status === 'delivered';
}

/** Money the customer will still be asked for, given the orders on screen. */
export function dueOnDeliveryMinor(orders: readonly { status: string; totalMinor: number }[]): number {
  return orders.reduce((sum, order) => (isOpenOrder(order.status) ? sum + order.totalMinor : sum), 0);
}

/** Money the shop has recorded as collected - `completed` means the owner marked payment received. */
export function recordedPaidMinor(orders: readonly { status: string; totalMinor: number }[]): number {
  return orders.reduce((sum, order) => (order.status === 'completed' ? sum + order.totalMinor : sum), 0);
}
