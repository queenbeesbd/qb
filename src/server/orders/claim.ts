/**
 * Linking a guest order to a customer account - ADR 0032.
 *
 * A guest may order without an account (ADR 0024). The receipt they land on is their only handle on
 * that order, and an owner-asked improvement is to offer them an account afterwards so the order
 * becomes part of their history and they count as a returning customer next time. This module is the
 * one place that attaches an existing order to an account.
 *
 * What makes the claim safe, and what does not:
 *
 * - **Possession of the order number is not proof of ownership.** It never was: the guest receipt is
 *   readable by number alone, so anyone holding the number can already read the order. The claim adds
 *   a signed-in identity to that handle and then makes the link permanent, which is why the claim is
 *   an explicit, recorded action the customer takes on the receipt rather than a side effect of
 *   signing in.
 * - **The database owns the permanence.** `queenbees_guard_order_immutable_columns` permits exactly
 *   one transition on `order.customer_id`: `null` -> a customer. A claimed order cannot be moved to
 *   another account and cannot be released, whatever any later code path attempts (migration 0019).
 * - **The link is a transaction.** The order row is locked, the transition is a guarded update that
 *   only matches while `customer_id is null`, and the event row carries a unique key, so two
 *   simultaneous claims cannot both succeed and one claim cannot be recorded twice.
 * - **Nothing about the money moves.** The charged amounts, the delivery split, the promotion
 *   snapshot and every state column are untouched; only the owner changes. A claimed order that is
 *   already `completed` therefore *does* make the customer a returning customer for a future
 *   delivery quote, because ADR 0029 reads "repeat" from `order.customer_id` and `order.status` - and
 *   that is the outcome the owner asked for.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, orderEvent } from '@/db/schema';

/** Why a claim did not happen. Each maps to one message, none reveals another account's data. */
export type ClaimFailure =
  /** No order carries that number. */
  | 'not_found'
  /** The order already belongs to a different account. */
  | 'already_claimed';

export type ClaimResult =
  | { ok: true; orderId: number; /** True when this call made the link, false when it already existed. */ changed: boolean }
  | { ok: false; failure: ClaimFailure };

/** Order numbers are short, unguessable references; bound the input before it reaches SQL. */
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,40}$/;

/**
 * Attaches a guest order to the signed-in customer, exactly once.
 *
 * Idempotent for the same customer: calling it again answers success with `changed: false` rather
 * than an error, because the interface may resubmit.
 */
export async function claimGuestOrder(
  tx: Transaction,
  input: { customerId: number; orderNumber: string },
): Promise<ClaimResult> {
  const orderNumber = input.orderNumber.trim();
  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) return { ok: false, failure: 'not_found' };

  const rows = await tx
    .select({ id: order.id, customerId: order.customerId })
    .from(order)
    .where(sql`${order.orderNumber} = ${orderNumber}`)
    .for('update');

  const row = rows[0];
  if (row === undefined) return { ok: false, failure: 'not_found' };

  // Already this customer's order: the request is satisfied, and the event is not written twice.
  if (row.customerId === input.customerId) return { ok: true, orderId: row.id, changed: false };
  if (row.customerId !== null) return { ok: false, failure: 'already_claimed' };

  const updated = await tx
    .update(order)
    .set({ customerId: input.customerId })
    .where(sql`${order.id} = ${row.id} and ${order.customerId} is null`)
    .returning({ id: order.id });

  if (updated.length === 0) return { ok: false, failure: 'already_claimed' };

  /*
   * The event is the customer's own record of the action, so the actor is `customer` and it carries
   * the customer id - the internal audit trail stays staff/system only (D23). `event_key` is unique,
   * so a retried claim cannot append a second row.
   */
  await tx
    .insert(orderEvent)
    .values({
      eventKey: `claim:${row.id}`,
      orderId: row.id,
      eventType: 'order_claimed',
      actorType: 'customer',
      actorCustomerId: input.customerId,
      payload: { customerId: input.customerId },
    })
    .onConflictDoNothing();

  return { ok: true, orderId: row.id, changed: true };
}
