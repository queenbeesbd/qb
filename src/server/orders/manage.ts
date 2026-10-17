/**
 * Order-lifecycle management - the owner's verification and COD decisions (Phase 16A, ADR 0014).
 *
 * Every action here is the same shape, on purpose:
 *
 * 1. **The route checked the session; the service re-checks the permission** (`requirePermission`),
 *    so a caller that forgets the route check fails closed.
 * 2. **The transition is guarded in the UPDATE's WHERE clause** on the current state, so a racing
 *    request or a double click cannot produce a second decision: the loser updates zero rows and
 *    reads `conflict` instead.
 * 3. **The order event and the flag/state change commit in the caller's transaction**, so the decision
 *    and its record exist together or not at all. Nothing here writes a denial; refusals are recorded
 *    by the guards or by `requirePermission`, in their own transactions.
 * 4. **No adverse decision bans anyone.** A ban is `suspendCustomer`, called explicitly. A rejection,
 *    a false-claim finding and a COD rejection touch only the order, the claim and (only on a
 *    *confirmed* false claim, and only when the owner asks) the review flag.
 *
 * Three decisions this module fixes in place, from ADR 0014:
 *
 * - **A mismatch hold is an open `payment_mismatch` operational exception, not a new claim state.**
 *   The claim stays `submitted` and the exception is closed by a person with a note.
 * - **A rejected COD order cancels the order** (`status='cancelled'`, guarded to `pending` only) and
 *   leaves `cod_state` at `cod_pending_approval`; the schema's `cod_state -> not_applicable` path is
 *   the "declined the method" case, not the case where the owner has spoken to the customer.
 * - **Clearing a prepaid order's `expires_at` is part of claiming** (ADR 0014 corrects the risk that
 *   a claim-less order is the first thing an expiry sweep would target); no expiry writer exists or
 *   is added here, and no function in this project updates `expires_at` on an order that carries a
 *   submitted claim.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import {
  customer,
  operationalException,
  order,
  orderContact,
  orderEvent,
  paymentClaim,
  paymentRecipient,
} from '@/db/schema';
import { recordAudit } from '../auth/audit';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';

// ------------------------------------------------------------------
// Reads - the owner queues
// ------------------------------------------------------------------

export type VerificationQueueRow = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly claimId: number;
  readonly submittedAt: Date;
  readonly paymentMethod: string;
  readonly recipientNumber: string;
  readonly recipientLabel: string;
  readonly senderMsisdn: string;
  readonly transactionReference: string;
  readonly claimedAmountMinor: number;
  readonly orderTotalMinor: number;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly area: string;
  readonly city: string;
  readonly addressLine: string;
  readonly hasOpenHold: boolean;
};

/**
 * Orders awaiting verification, oldest first - the age of the claim is how long a customer has been
 * waiting. Payments evidence only: no credential, no session token, no flag history on this read.
 */
export async function listVerificationQueue(tx: Transaction): Promise<VerificationQueueRow[]> {
  const rows = await tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      claimId: paymentClaim.id,
      submittedAt: paymentClaim.submittedAt,
      paymentMethod: order.paymentMethod,
      recipientNumber: paymentRecipient.accountNumber,
      recipientLabel: paymentRecipient.accountLabel,
      senderMsisdn: paymentClaim.senderMsisdn,
      transactionReference: paymentClaim.transactionReference,
      claimedAmountMinor: paymentClaim.claimedAmountMinor,
      orderTotalMinor: order.totalMinor,
      recipientName: orderContact.recipientName,
      recipientPhone: orderContact.recipientPhone,
      area: orderContact.area,
      city: orderContact.city,
      addressLine: orderContact.addressLine,
      hasOpenHold: sql<boolean>`exists (
        select 1 from operational_exception
        where type = 'payment_mismatch'
          and subject_key = 'claim:' || payment_claim.id::text
          and state in ('open', 'acknowledged')
      )`,
    })
    .from(paymentClaim)
    .innerJoin(order, sql`${order.id} = ${paymentClaim.orderId}`)
    .innerJoin(paymentRecipient, sql`${paymentRecipient.id} = ${paymentClaim.paymentRecipientId}`)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${paymentClaim.orderId}`)
    .where(sql`${paymentClaim.state} = 'submitted'`)
    .orderBy(paymentClaim.submittedAt, paymentClaim.id);

  // A reference used on another submitted claim is flagged in place: a person looks before deciding,
  // and the database refuses nothing because a duplicate reference is an honest mistake to surface,
  // not a validation error to reject. The flag itself is computed by the caller that renders it
  // (`paymentsQueue`, from `duplicateReferences`), so this read stays a plain projection of the rows.
  return rows;
}

/** Transaction references shared by more than one submitted claim, for the queue's duplicate flags. */
export async function duplicateReferences(tx: Transaction): Promise<Set<string>> {
  const rows = await tx
    .select({ reference: paymentClaim.transactionReference, uses: sql<number>`count(*)::int` })
    .from(paymentClaim)
    .where(sql`${paymentClaim.state} = 'submitted'`)
    .groupBy(paymentClaim.transactionReference);
  return new Set(rows.filter((row) => row.uses > 1).map((row) => row.reference));
}

export type CodQueueRow = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly totalMinor: number;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly area: string;
  readonly city: string;
  readonly addressLine: string;
};

/** COD orders awaiting the owner's call and confirmation, oldest first. */
export async function listCodApprovalQueue(tx: Transaction): Promise<CodQueueRow[]> {
  return tx
    .select({
      orderId: order.id,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      totalMinor: order.totalMinor,
      recipientName: orderContact.recipientName,
      recipientPhone: orderContact.recipientPhone,
      area: orderContact.area,
      city: orderContact.city,
      addressLine: orderContact.addressLine,
    })
    .from(order)
    .innerJoin(orderContact, sql`${orderContact.orderId} = ${order.id}`)
    // Both halves of the same guard the decision holds: `cod_state` alone would keep an order the
    // owner has already rejected - which a rejection cancels - in this worklist for good, where every
    // further action could only answer "already decided".
    .where(sql`${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`)
    .orderBy(order.placedAt, order.id);
}

export async function countVerificationQueue(tx: Transaction): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(paymentClaim)
    .where(sql`${paymentClaim.state} = 'submitted'`);
  return rows[0]?.total ?? 0;
}

export async function countCodApprovalQueue(tx: Transaction): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .where(sql`${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`);
  return rows[0]?.total ?? 0;
}

// ------------------------------------------------------------------
// Prepaid verification decisions
// ------------------------------------------------------------------

export type VerificationDecision = 'verify' | 'reject' | 'falsely_claimed' | 'hold' | 'release_hold';

/** Minimum reason length shared with `suspendCustomer` and `customer_flag.reason` (>= 10 chars). */
const MIN_REASON = 10;

function decisionReason(raw: FormDataEntryValue | null, minimum: number): string {
  const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (value.length < minimum) throw new ValidationError(`a reason of at least ${minimum} characters is required`);
  return value;
}

/** Bounded integer parse of a form value; `null` when absent or not a plain non-negative number. */
function parseAmountMinor(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string' || !/^[0-9]{1,9}$/.test(raw.trim())) return null;
  const value = Number.parseInt(raw, 10);
  return value === 0 ? null : value;
}

/**
 * Applies one decision to the submitted claim on one order.
 *
 * Every branch re-reads the claim under this transaction and guards the update on
 * `state = 'submitted'`, so two decisions racing on the same claim produce exactly one outcome and
 * one audit record. `hold` and `release_hold` do not change the claim's state at all; they move the
 * **exception**, which is what a hold is (ADR 0014 Part 3.2 option 1).
 */
export async function decideVerification(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly claimId: number;
    readonly decision: VerificationDecision;
    /** Present only for a verified payment: the confirmed amount, poisha. */
    readonly rawVerifiedAmount?: FormDataEntryValue | null;
    readonly verifiedAmountMinor?: number | null;
    /** Required for reject, falsely_claimed and hold; ignored otherwise. */
    readonly reason?: string;
    /** Whether verifying a mismatching amount was explicitly acknowledged. */
    readonly mismatchAcknowledged?: boolean;
  },
): Promise<{ applied: boolean }> {
  const decision = input.decision;
  const claimRows = await tx
    .select({
      claimId: paymentClaim.id,
      orderId: paymentClaim.orderId,
      state: paymentClaim.state,
      claimedAmountMinor: paymentClaim.claimedAmountMinor,
      amountMismatch: sql<boolean>`${paymentClaim.claimedAmountMinor} <> ${order.totalMinor}`,
      orderNumber: order.orderNumber,
      paymentState: order.paymentState,
    })
    .from(paymentClaim)
    .innerJoin(order, sql`${order.id} = ${paymentClaim.orderId}`)
    .where(sql`${paymentClaim.id} = ${input.claimId}`);
  const claim = claimRows[0];
  if (claim === undefined) throw new ValidationError('no such payment claim');
  if (claim.state !== 'submitted') throw new ConflictError('the claim has already been decided');

  const subjectKey = `claim:${claim.claimId}`;

  if (decision === 'hold') {
    await requirePermission(actor, PERMISSIONS.paymentReject, 'payment_claim', claim.claimId);
    const reason = decisionReason(input.reason ?? null, MIN_REASON);
    const opened = await tx
      .insert(operationalException)
      .values({ type: 'payment_mismatch', orderId: claim.orderId, subjectKey, severity: 'warning', note: reason })
      .onConflictDoNothing()
      .returning({ id: operationalException.id });
    if (opened.length === 0) throw new ConflictError('this claim is already held');
    await tx.insert(orderEvent).values({
      eventKey: `order:${claim.orderNumber}:held`,
      orderId: claim.orderId,
      eventType: 'claim_submitted',
      fromValue: claim.state,
      toValue: claim.state,
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      reason,
      payload: { hold: 'payment_mismatch', exceptionSubject: subjectKey },
    });
    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'payment.held',
      entityType: 'payment_claim',
      entityId: claim.claimId,
      before: { claimState: claim.state, hasOpenHold: false },
      after: { claimState: claim.state, hasOpenHold: true },
      reason,
    });
    return { applied: true };
  }

  if (decision === 'release_hold') {
    await requirePermission(actor, PERMISSIONS.paymentReject, 'payment_claim', claim.claimId);
    const reason = decisionReason(input.reason ?? null, MIN_REASON);
    const closed = await tx
      .update(operationalException)
      .set({ state: 'resolved', resolvedAt: new Date(), resolvedByStaffId: actor.staffUserId, note: reason })
      .where(
        sql`${operationalException.type} = 'payment_mismatch' and ${operationalException.subjectKey} = ${subjectKey}
            and ${operationalException.state} in ('open', 'acknowledged')`,
      )
      .returning({ id: operationalException.id });
    if (closed.length === 0) throw new ConflictError('this claim is not held');
    await tx.insert(orderEvent).values({
      eventKey: `order:${claim.orderNumber}:hold-released`,
      orderId: claim.orderId,
      eventType: 'claim_submitted',
      fromValue: claim.state,
      toValue: claim.state,
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      reason,
      payload: { holdReleased: 'payment_mismatch' },
    });
    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'payment.hold_released',
      entityType: 'payment_claim',
      entityId: claim.claimId,
      reason,
    });
    return { applied: true };
  }

  // `verify` needs the confirmed amount; the other two need a reasoned finding.
  let verifiedAmountMinor: number | null = null;
  let acknowledged = false;
  if (decision === 'verify') {
    verifiedAmountMinor = parseAmountMinor(input.rawVerifiedAmount ?? null);
    if (verifiedAmountMinor === null) throw new ValidationError('a confirmed amount in poisha is required');
    acknowledged = input.mismatchAcknowledged === true;
    if (claim.amountMismatch && !acknowledged) {
      throw new ValidationError('the claimed amount differs from the order total and requires acknowledgement');
    }
  }
  const reason =
    decision === 'verify' ? null : decisionReason(input.reason ?? null, MIN_REASON);

  await requirePermission(
    actor,
    decision === 'verify'
      ? PERMISSIONS.paymentVerify
      : decision === 'reject'
        ? PERMISSIONS.paymentReject
        : PERMISSIONS.paymentFlagFalse,
    'payment_claim',
    claim.claimId,
  );

  const paymentState = decision === 'verify' ? 'verified' : decision === 'reject' ? 'rejected' : 'falsely_claimed';
  const resolvedAt = new Date();

  // Guarded on the current state: a second decision is zero rows and a conflict, not a second write.
  const updated = await tx
    .update(paymentClaim)
    .set({ state: paymentState, resolvedAt, resolvedByStaffId: actor.staffUserId,
           verifiedAmountMinor, resolutionReason: reason, mismatchAcknowledged: acknowledged })
    .where(sql`${paymentClaim.id} = ${claim.claimId} and ${paymentClaim.state} = 'submitted'`)
    .returning({ id: paymentClaim.id });
  if (updated.length === 0) throw new ConflictError('the claim has already been decided');

  // The order's money state mirrors the claim's, also guarded.
  await tx
    .update(order)
    .set({ paymentState, updatedAt: resolvedAt })
    .where(sql`${order.id} = ${claim.orderId} and ${order.paymentState} = 'awaiting_verification'`);

  const eventType =
    decision === 'verify' ? 'payment_verified' : decision === 'reject' ? 'payment_rejected' : 'payment_falsely_claimed';
  await tx.insert(orderEvent).values({
    eventKey: `order:${claim.orderNumber}:${eventType}`,
    orderId: claim.orderId,
    eventType,
    fromValue: 'awaiting_verification',
    toValue: paymentState,
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    reason,
    payload: { claimId: claim.claimId, verifiedAmountMinor, amountMismatch: claim.amountMismatch, acknowledgedOnMismatch: acknowledged },
  });

  const auditAction =
    decision === 'verify' ? 'payment.verified' : decision === 'reject' ? 'payment.rejected' : 'payment.falsely_claimed';
  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: auditAction,
    entityType: 'payment_claim',
    entityId: claim.claimId,
    before: { claimState: 'submitted', orderPaymentState: 'awaiting_verification', hasOpenHold: await hasOpenHold(tx, subjectKey) },
    after: { claimState: paymentState, orderPaymentState: paymentState },
    reason,
  });

  return { applied: true };
}

async function hasOpenHold(tx: Transaction, subjectKey: string): Promise<boolean> {
  const rows = await tx
    .select({ id: operationalException.id })
    .from(operationalException)
    .where(
      sql`${operationalException.type} = 'payment_mismatch' and ${operationalException.subjectKey} = ${subjectKey}
          and ${operationalException.state} in ('open', 'acknowledged')`,
    );
  return rows.length > 0;
}

// ------------------------------------------------------------------
// COD confirmation decisions
// ------------------------------------------------------------------

export type CodDecision = 'approve' | 'reject';

/**
 * Applies one COD decision after the owner's call.
 *
 * Approving guards `cod_state = 'cod_pending_approval'` and also flips `order.status` to `confirmed`,
 * both guarded, so a COD order the owner accepted is exactly the order that moves on to processing.
 * Rejecting cancels the order - only while it is still `pending`, so an order that somehow moved on is
 * refused rather than cancelled from a later stage.
 */
export async function decideCod(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly orderId: number; readonly decision: CodDecision; readonly reason: string },
): Promise<{ applied: boolean }> {
  const permission = input.decision === 'approve' ? PERMISSIONS.codApprove : PERMISSIONS.orderCancel;
  await requirePermission(actor, permission, 'order', input.orderId);

  const reason = decisionReason(input.reason, MIN_REASON);

  const orderRows = await tx
    .select({ id: order.id, orderNumber: order.orderNumber, codState: order.codState, status: order.status })
    .from(order)
    .where(sql`${order.id} = ${input.orderId}`);
  const row = orderRows[0];
  if (row === undefined) throw new ValidationError('no such order');
  if (row.codState !== 'cod_pending_approval') throw new ConflictError('this order has already been decided');

  const decidedAt = new Date();

  if (input.decision === 'approve') {
    const approved = await tx
      .update(order)
      .set({ codState: 'cod_approved', status: 'confirmed', confirmedAt: decidedAt, updatedAt: decidedAt })
      .where(sql`${order.id} = ${row.id} and ${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`)
      .returning({ id: order.id });
    if (approved.length === 0) throw new ConflictError('this order has already been decided');
    await tx.insert(orderEvent).values({
      eventKey: `order:${row.orderNumber}:cod-approved`,
      orderId: row.id,
      eventType: 'cod_approved',
      fromValue: 'cod_pending_approval',
      toValue: 'cod_approved',
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      reason,
      payload: { orderStatus: 'confirmed' },
    });
    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'cod.approved',
      entityType: 'order',
      entityId: row.id,
      before: { codState: 'cod_pending_approval', status: row.status },
      after: { codState: 'cod_approved', status: 'confirmed' },
      reason,
    });
    return { applied: true };
  }

  const cancelled = await tx
    .update(order)
    .set({ status: 'cancelled', cancelledAt: decidedAt, cancelledReason: reason, updatedAt: decidedAt })
    .where(sql`${order.id} = ${row.id} and ${order.codState} = 'cod_pending_approval' and ${order.status} = 'pending'`)
    .returning({ id: order.id });
  if (cancelled.length === 0) throw new ConflictError('this order has already been decided');
  await tx.insert(orderEvent).values({
    eventKey: `order:${row.orderNumber}:cod-rejected`,
    orderId: row.id,
    eventType: 'order_cancelled',
    fromValue: 'cod_pending_approval',
    toValue: 'cancelled',
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    reason,
    payload: { decision: 'cod_rejected' },
  });
  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'cod.cancelled',
    entityType: 'order',
    entityId: row.id,
    // Deliberate: `cod_state` stays `cod_pending_approval` because the schema binds it to the payment
    // method (`order_cod_state_only_for_cod`), and cancelling the order - not changing a COD method -
    // is what a rejection records. The queue read filters on the same state this guard holds, so a
    // rejected COD order leaves the worklist without ever claiming it became something else.
    before: { codState: 'cod_pending_approval', status: 'pending' },
    after: { codState: 'cod_pending_approval', status: 'cancelled' },
    reason,
  });
  return { applied: true };
}

// ------------------------------------------------------------------
// Customer moderation
// ------------------------------------------------------------------

export type CustomerQueueRow = {
  readonly customerId: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAt: Date;
  readonly orderCount: number;
  readonly lastOrderAt: Date | null;
  readonly flagged: boolean;
};

/** The customer worklist, for the owner's moderation view - email, standing and order count only. */
export async function listCustomers(tx: Transaction): Promise<CustomerQueueRow[]> {
  const rows = await tx
    .select({
      customerId: customer.id,
      email: customer.email,
      displayName: customer.displayName,
      status: customer.status,
      createdAt: customer.createdAt,
      orderCount: sql<number>`(
        select count(*)::int from "order" where "order"."customer_id" = customer.id
      )`,
      lastOrderAt: sql<Date | null>`(
        select max("order"."placed_at") from "order" where "order"."customer_id" = customer.id
      )`,
      flagged: sql<boolean>`exists (
        select 1 from customer_flag where customer_flag.customer_id = customer.id and customer_flag.state = 'raised'
      )`,
    })
    .from(customer)
    .where(sql`${customer.deletedAt} is null`)
    .orderBy(sql`${customer.createdAt} desc`);
  return rows;
}
