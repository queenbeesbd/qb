/**
 * The payment screenshot's write path - attaching one, and the owner's decision about it (ADR 0042).
 *
 * Everything here is deliberately small, because the feature is small: a customer may attach one image
 * that says "I paid", and the owner may record that they looked. **No function in this module touches
 * the order.** Not its status, not `payment_state`, not `cod_state`, not its total, not its event log,
 * not stock, not a refund. There is no payment state in this database for a screenshot to set, and
 * adding one is a different owner decision.
 *
 * Two rules are enforced here rather than left to the screens:
 *
 * - **One row per order.** A re-upload replaces the file columns and returns the row to `pending`,
 *   because a new image is a new claim and a stale "checked" must not silently cover it.
 * - **A rejection states why.** "Rejected" with no words leaves the next reader guessing; the typed
 *   reason is the only record of what was wrong. A check may carry an optional note.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { order, paymentProof } from '@/db/schema';
import { recordAudit } from '@/server/auth/audit';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import type { ProofAsset } from './proof-upload';

/** What the owner can decide. There is no third answer: a screenshot is checked or it is not. */
export type ProofDecision = 'checked' | 'rejected';

export type ProofTarget = {
  readonly orderId: number;
  /** `null` on a guest order - the receipt's own visibility rule, reused rather than re-invented. */
  readonly customerId: number | null;
};

/**
 * What the receipt says about the screenshot: whether one exists and what state it is in.
 *
 * Deliberately small and separate from the order read: the receipt page and the owner's page ask the
 * same question, and neither should have to reach into the other's projection to answer it.
 */
export async function loadProofSummary(
  tx: Transaction,
  orderNumber: string,
): Promise<{
  readonly reviewState: string;
  readonly uploadedAt: Date;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
} | null> {
  const rows = await tx
    .select({
      reviewState: paymentProof.reviewState,
      uploadedAt: paymentProof.uploadedAt,
      reviewedAt: paymentProof.reviewedAt,
      reviewNote: paymentProof.reviewNote,
    })
    .from(paymentProof)
    .innerJoin(order, sql`${order.id} = ${paymentProof.orderId}`)
    .where(sql`${order.orderNumber} = ${orderNumber}`)
    .limit(1);

  return rows[0] ?? null;
}

/**
 * The order a viewer is allowed to attach to, or `null`.
 *
 * The rule is the receipt's: a guest order is reachable by its number (that handle is what the receipt
 * already relies on), and a customer's order only by that customer. The order number is an opaque
 * 64-bit token, and possession of it never grants anything beyond this attachment and the receipt the
 * same browser could already read.
 */
export async function proofTarget(
  tx: Transaction,
  viewerCustomerId: number | null,
  orderNumber: string,
): Promise<ProofTarget | null> {
  const rows = await tx
    .select({ orderId: order.id, customerId: order.customerId })
    .from(order)
    .where(sql`${order.orderNumber} = ${orderNumber}`)
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  if (row.customerId !== null && row.customerId !== viewerCustomerId) return null;
  return { orderId: row.orderId, customerId: row.customerId };
}

/**
 * Stores the attachment, or replaces the one already there.
 *
 * The bytes are already written by `saveProof`; this records which object they are and clears any
 * earlier decision, in the caller's transaction.
 */
export async function attachProof(
  tx: Transaction,
  target: ProofTarget,
  asset: ProofAsset,
): Promise<void> {
  await tx
    .insert(paymentProof)
    .values({
      orderId: target.orderId,
      storageKey: asset.storageKey,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      uploadedBy: 'customer',
    })
    .onConflictDoUpdate({
      target: paymentProof.orderId,
      set: {
        storageKey: sql`excluded.storage_key`,
        contentType: sql`excluded.content_type`,
        byteSize: sql`excluded.byte_size`,
        width: sql`excluded.width`,
        height: sql`excluded.height`,
        uploadedAt: sql`now()`,
        uploadedBy: sql`excluded.uploaded_by`,
        // A new image is a new claim: the earlier decision is discarded, not carried over.
        reviewState: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      },
    });
}

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
