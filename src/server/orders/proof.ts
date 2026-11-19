/**
 * The payment screenshot's owner-side path - the decision about it (ADR 0042).
 *
 * **The customer's write path is checkout only (owner direction, 2026-11-19).** ADR 0042 put the same
 * optional field on the order receipt, so a customer who paid *after* ordering could still attach the
 * screenshot. The owner reported that card on the receipt as a defect and asked for it to go: the
 * receipt is the confirmation of what was bought, not a second form. So the receipt no longer draws a
 * field, no route accepts one, and the helpers that attached a replacement image from the receipt
 * (`proofTarget`, `attachProof`, `loadProofSummary`) were deleted rather than left unreferenced. An
 * order now carries at most the one image attached while it was placed.
 *
 * Everything here is deliberately small: the owner may record that they looked at that image. **No
 * function in this module touches the order.** Not its status, not `payment_state`, not `cod_state`,
 * not its total, not its event log, not stock, not a refund. There is no payment state in this
 * database for a screenshot to set, and adding one is a different owner decision.
 *
 * A rejection must state why: "rejected" with no words leaves the next reader guessing, and the typed
 * reason is the only record of what was wrong. A check may carry an optional note.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, paymentProof } from '@/db/schema';
import { recordAudit } from '@/server/auth/audit';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';

/** What the owner can decide. There is no third answer: a screenshot is checked or it is not. */
export type ProofDecision = 'checked' | 'rejected';

/**
 * Records the owner's reading of one screenshot.
 *
 * `payment.proof_review` is re-checked here, so a forged form that reaches the route still cannot decide
 * anything. The audit row and the change commit together, and the row it names is the proof - never the
 * order, because the order did not move.
 */
export async function reviewPaymentProof(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderNumber: string; readonly decision: ProofDecision; readonly note: unknown },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.paymentProofReview, 'payment_proof', 1);

  const note = typeof input.note === 'string' ? input.note.replace(/\r\n/g, '\n').trim() : '';
  if (note.length > 500) throw new ValidationError('the note must be 500 characters or fewer');
  if (input.decision === 'rejected' && note.length < 3) {
    throw new ValidationError('a rejection needs a short reason');
  }

  const rows = await tx
    .select({
      id: paymentProof.id,
      orderId: paymentProof.orderId,
      reviewState: paymentProof.reviewState,
    })
    .from(paymentProof)
    .innerJoin(order, sql`${order.id} = ${paymentProof.orderId}`)
    .where(sql`${order.orderNumber} = ${input.orderNumber}`)
    .limit(1);

  const proof = rows[0];
  if (proof === undefined) throw new ValidationError('this order has no payment screenshot');

  await tx
    .update(paymentProof)
    .set({
      reviewState: input.decision,
      reviewedBy: actor.staffUserId,
      reviewedAt: new Date(),
      reviewNote: note.length === 0 ? null : note,
    })
    .where(sql`${paymentProof.id} = ${proof.id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'order.payment_proof_reviewed',
    entityType: 'payment_proof',
    entityId: proof.id,
    before: { reviewState: proof.reviewState },
    after: { reviewState: input.decision },
    reason: note.length === 0 ? null : note,
  });
}
