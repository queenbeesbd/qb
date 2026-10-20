/**
 * POST /api/admin/orders/transition - one operational transition on an order.
 *
 * The route does three things and no policy: it validates the shape of the request, it calls the
 * service function for the named action, and it redirects back to the order with a fixed notice code.
 * **Every guard lives in the service** (src/server/orders/fulfilment.ts), which re-checks the action's
 * own permission and the order's current state, so a request that skipped this route still could not do
 * anything it should not.
 *
 * The order number used for the redirect is read from the database, never taken from the form: a
 * redirect that trusted a submitted reference could point a signed-in owner at another order, and the
 * encoded path would become a free navigation primitive.
 */

import { sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { customerReturn, order } from '@/db/schema';
import { guardMutation } from '@/server/auth/guard';
import { ORDERS_PATH } from '@/server/auth/constants';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import {
  cancelOrderBeforeDispatch,
  completeOrder,
  dispatchOrder,
  inspectReturn,
  markPaymentReceived,
  recordDelivered,
  recordDeliveryFailed,
  recordParcelReceived,
} from '@/server/orders/fulfilment';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

/** The closed action set. Anything else is 'invalid', never "run the closest match". */
const ACTIONS = [
  'dispatch',
  'delivered',
  'failed',
  'return_received',
  'inspect_accepted',
  'inspect_rejected',
  'paid',
  'complete',
  'cancel',
] as const;

type Action = (typeof ACTIONS)[number];

const NOTICES: Record<Action, string> = {
  dispatch: 'dispatched',
  delivered: 'delivered',
  failed: 'failed',
  return_received: 'returned',
  inspect_accepted: 'inspected',
  inspect_rejected: 'inspected',
  // "Payment received" is the owner's own act; it records the receipt and completes the order.
  paid: 'paid',
  complete: 'completed',
  cancel: 'cancelled',
};

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value : '';
}

/** The order number, for the redirect only. Read under the same session and transaction as the write. */
async function orderNumberOf(tx: Transaction, orderId: number): Promise<string | null> {
  const rows = await tx
    .select({ orderNumber: order.orderNumber })
    .from(order)
    .where(sql`${order.id} = ${orderId}`);
  return rows[0]?.orderNumber ?? null;
}

/** The order an inspected return belongs to, for the same redirect. */
async function orderOfReturn(tx: Transaction, returnId: number): Promise<number | null> {
  const rows = await tx
    .select({ orderId: customerReturn.orderId })
    .from(customerReturn)
    .where(sql`${customerReturn.id} = ${returnId}`);
  return rows[0]?.orderId ?? null;
}

/**
 * The additional costs a form submitted, in the order they appear.
 *
 * The form posts `costAmount` and `costDescription` as repeated fields with no index: a blank pair is
 * simply skipped, so "no costs" needs no special case and the owner is never forced to invent one. Each
 * value is passed through untouched - the service parses and validates it, and refuses the whole action
 * if any pair is invalid.
 */
function readCosts(form: FormData): { amount: string; description: string }[] {
  const amounts = form.getAll('costAmount');
  const descriptions = form.getAll('costDescription');
  const costs: { amount: string; description: string }[] = [];
  for (let index = 0; index < Math.max(amounts.length, descriptions.length); index += 1) {
    const amount = amounts[index];
    const description = descriptions[index];
    const amountText = typeof amount === 'string' ? amount : '';
    const descriptionText = typeof description === 'string' ? description : '';
    if (amountText.trim() === '' && descriptionText.trim() === '') continue;
    costs.push({ amount: amountText, description: descriptionText });
  }
  return costs;
}

/** A refusal: back to the order the request named, resolved from the database, or to the list. */
async function backTo(notice: string, orderId: number | null, returnId: number | null): Promise<Response> {
  if (orderId === null && returnId === null) return redirectTo(ORDERS_PATH + '?notice=' + notice);
  try {
    const number = await withTransaction(async (tx) => {
      if (orderId !== null) return orderNumberOf(tx, orderId);
      const owner = returnId === null ? null : await orderOfReturn(tx, returnId);
      return owner === null ? null : orderNumberOf(tx, owner);
    });
    if (number === null) return redirectTo(ORDERS_PATH + '?notice=' + notice);
    return redirectTo(ORDERS_PATH + '/' + encodeURIComponent(number) + '?notice=' + notice);
  } catch {
    return redirectTo(ORDERS_PATH + '?notice=' + notice);
  }
}

export async function POST(request: Request): Promise<Response> {
  // The route-level gate is order.read; each service function checks the permission its own action
  // needs, so a session that may read an order still cannot collect cash on it.
  const guard = await guardMutation(request, PERMISSIONS.orderRead);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const rawAction = text(form, 'action');
  const action = (ACTIONS as readonly string[]).includes(rawAction) ? (rawAction as Action) : null;
  const orderId = parseId(form.get('orderId'));
  const returnId = parseId(form.get('returnId'));
  const reason = text(form, 'reason');
  const note = text(form, 'note');

  if (action === null) return redirectTo(ORDERS_PATH + '?notice=invalid');
  const isInspection = action === 'inspect_accepted' || action === 'inspect_rejected';
  if (isInspection ? returnId === null : orderId === null) {
    return redirectTo(ORDERS_PATH + '?notice=invalid');
  }
  if (isInspection && action === 'inspect_rejected' && reason === '' && note === '') {
    return backTo('invalid', orderId, returnId);
  }

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  try {
    const back = await withTransaction(async (tx) => {
      const id = orderId as number;
      switch (action) {
        case 'dispatch':
          await dispatchOrder(tx, actor, { orderId: id, note });
          break;
        case 'delivered':
          await recordDelivered(tx, actor, { orderId: id, note });
          break;
        case 'failed':
          await recordDeliveryFailed(tx, actor, { orderId: id, reason });
          break;
        case 'return_received':
          await recordParcelReceived(tx, actor, { orderId: id, note });
          break;
        case 'paid':
          await markPaymentReceived(tx, actor, { orderId: id, note, costs: readCosts(form) });
          break;
        case 'complete':
          await completeOrder(tx, actor, { orderId: id, note });
          break;
        case 'cancel':
          await cancelOrderBeforeDispatch(tx, actor, { orderId: id, reason });
          break;
        case 'inspect_accepted':
        case 'inspect_rejected':
          await inspectReturn(tx, actor, {
            returnId: returnId as number,
            accepted: action === 'inspect_accepted',
            note: reason === '' ? note : reason,
          });
          break;
      }

      if (orderId !== null) return orderNumberOf(tx, orderId);
      const owner = await orderOfReturn(tx, returnId as number);
      return owner === null ? null : orderNumberOf(tx, owner);
    });

    if (back === null) return redirectTo(ORDERS_PATH + '?notice=invalid');
    return redirectTo(ORDERS_PATH + '/' + encodeURIComponent(back) + '?notice=' + NOTICES[action]);
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid', orderId, returnId);
    if (error instanceof ConflictError) return backTo('conflict', orderId, returnId);
    if (error instanceof AuthorizationError) return backTo('denied', orderId, returnId);
    throw error;
  }
}
