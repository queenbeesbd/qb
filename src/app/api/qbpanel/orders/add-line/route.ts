/**
 * POST /api/qbpanel/orders/add-line - append one product to an order before dispatch (ADR 0046).
 *
 * The route does only what a route should: it resolves the session behind `order.amend`, reads and
 * bounds the form, calls the service (which re-checks the permission and every state rule), and
 * redirects back to the order with a fixed notice. The line, the totals and their trail commit in one
 * transaction; a refusal writes nothing.
 */

import { sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { order } from '@/db/schema';
import { guardMutation } from '@/server/auth/guard';
import { ORDERS_PATH } from '@/server/auth/constants';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { addOrderLine } from '@/server/orders/amend';
import { parseId } from '@/server/catalog/validation';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

async function orderNumberOf(tx: Transaction, orderId: number): Promise<string | null> {
  const rows = await tx
    .select({ orderNumber: order.orderNumber })
    .from(order)
    .where(sql`${order.id} = ${orderId}`)
    .limit(1);
  return rows[0]?.orderNumber ?? null;
}

function text(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value : '';
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.orderAmend);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const orderId = parseId(form.get('orderId'));
  const productId = parseId(form.get('productId'));
  const variantRaw = text(form, 'variantId');
  const variantId = variantRaw === '' ? null : parseId(variantRaw);
  const quantity = Number(text(form, 'quantity'));
  const reason = text(form, 'reason');
  const idempotencyKey = text(form, 'idempotencyKey');

  if (orderId === null || productId === null || (variantRaw !== '' && variantId === null)) {
    return redirectTo(`${ORDERS_PATH}?notice=lineInvalid`);
  }

  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  try {
    const number = await withTransaction(async (tx) => {
      await addOrderLine(tx, actor, { orderId, productId, variantId, quantity, reason, idempotencyKey });
      return orderNumberOf(tx, orderId);
    });
    return redirectTo(
      number === null ? `${ORDERS_PATH}?notice=lineAdded` : `${ORDERS_PATH}/${encodeURIComponent(number)}?notice=lineAdded`,
    );
  } catch (error) {
    const notice =
      error instanceof ValidationError
        ? 'lineInvalid'
        : error instanceof ConflictError
          ? 'conflict'
          : error instanceof AuthorizationError
            ? 'denied'
            : null;
    if (notice === null) throw error;
    const number = await withTransaction((tx) => orderNumberOf(tx, orderId));
    return redirectTo(
      number === null ? `${ORDERS_PATH}?notice=${notice}` : `${ORDERS_PATH}/${encodeURIComponent(number)}?notice=${notice}`,
    );
  }
}
