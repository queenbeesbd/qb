/**
 * POST /api/admin/orders/cost - record or void one additional courier cost on an order.
 *
 * Two operations, one permission (`order.cost_record`, which the service also re-checks): record a cost
 * the owner incurred, or void one that was entered wrongly. A void is the only correction path - an
 * amount and description are frozen after insert, so the history stays readable.
 *
 * Neither operation touches the order's charged total: an additional cost is the shop's expense, not a
 * line on the customer's invoice, and `order`'s immutability trigger would refuse the attempt anyway.
 * The redirect carries only a fixed notice code.
 */

import { sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { order } from '@/db/schema';
import { ORDERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { recordAdditionalCost, voidAdditionalCost } from '@/server/orders/costs';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['record', 'void'] as const;

/** The order number for the redirect, read from the database rather than taken from the form. */
async function orderNumberOf(tx: Transaction, orderId: number): Promise<string | null> {
  const rows = await tx
    .select({ orderNumber: order.orderNumber })
    .from(order)
    .where(sql`${order.id} = ${orderId}`);
  return rows[0]?.orderNumber ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.orderRead);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  const orderId = parseId(form.get('orderId'));
  if (orderId === null || !(OPERATIONS as readonly string[]).includes(operation)) {
    return redirectTo(ORDERS_PATH + '?notice=invalid');
  }

  try {
    const number = await withTransaction(async (tx) => {
      if (operation === 'record') {
        await recordAdditionalCost(tx, actor, {
          orderId,
          amount: form.get('amount'),
          description: form.get('description'),
        });
      } else {
        const costId = parseId(form.get('costId'));
        if (costId === null) throw new ValidationError('no such cost');
        await voidAdditionalCost(tx, actor, { costId, reason: form.get('reason') });
      }
      return orderNumberOf(tx, orderId);
    });

    const notice = operation === 'record' ? 'costRecorded' : 'costVoided';
    if (number === null) return redirectTo(ORDERS_PATH + '?notice=' + notice);
    return redirectTo(ORDERS_PATH + '/' + encodeURIComponent(number) + '?notice=' + notice);
  } catch (error) {
    const notice =
      error instanceof ValidationError
        ? 'costInvalid'
        : error instanceof ConflictError
          ? 'conflict'
          : error instanceof AuthorizationError
            ? 'denied'
            : null;
    if (notice === null) throw error;
    return redirectTo(ORDERS_PATH + '/' + encodeURIComponent(String(orderId)) + '?notice=' + notice);
  }
}
