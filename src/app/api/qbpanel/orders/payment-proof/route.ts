/**
 * POST /api/qbpanel/orders/payment-proof - record the owner's reading of a customer's screenshot
 * (ADR 0042).
 *
 * `payment.proof_review` (privileged, so a moderator can never hold it), and the service re-checks it.
 * The decision records that the owner compared the image with the shop's own bKash statement - it moves
 * **no** order state, no payment state, no total and no stock. A rejection requires a typed reason; a
 * check may carry an optional note.
 *
 * The redirect carries a fixed notice code and the order's own number, read from the database rather
 * than taken from the form.
 */

import { sql } from 'drizzle-orm';

import { withTransaction, type Transaction } from '@/db/client';
import { order } from '@/db/schema';
import { ORDERS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { reviewPaymentProof, type ProofDecision } from '@/server/orders/proof';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const DECISIONS: readonly ProofDecision[] = ['checked', 'rejected'];

/** The order number for the redirect, read from the database rather than taken from the form. */
async function orderNumberOf(tx: Transaction, orderId: number): Promise<string | null> {
  const rows = await tx
    .select({ orderNumber: order.orderNumber })
    .from(order)
    .where(sql`${order.id} = ${orderId}`);
  return rows[0]?.orderNumber ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.paymentProofReview);
  if (!guard.ok) return deny(guard.status);

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const rawDecision = form.get('decision');
  const decision = typeof rawDecision === 'string' ? rawDecision : '';
  const orderNumber = typeof form.get('orderNumber') === 'string' ? String(form.get('orderNumber')).trim() : '';
  if (!(DECISIONS as readonly string[]).includes(decision) || orderNumber === '') {
    return redirectTo(`${ORDERS_PATH}?notice=proofInvalid`);
  }

  try {
    const number = await withTransaction(async (tx) => {
      await reviewPaymentProof(tx, actor, {
        orderNumber,
        decision: decision as ProofDecision,
        note: form.get('note') ?? '',
      });
      // The order number the redirect names is the one the proof row actually belongs to.
      const rows = await tx
        .select({ orderId: order.id })
        .from(order)
        .where(sql`${order.orderNumber} = ${orderNumber}`)
        .limit(1);
      const orderId = rows[0]?.orderId;
      return orderId === undefined ? null : orderNumberOf(tx, orderId);
    });
    if (number === null) return redirectTo(`${ORDERS_PATH}?notice=proofReviewed`);
    return redirectTo(`${ORDERS_PATH}/${number}?notice=proofReviewed`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${ORDERS_PATH}?notice=proofInvalid`);
    if (error instanceof AuthorizationError) return deny(403);
    throw error;
  }
}
