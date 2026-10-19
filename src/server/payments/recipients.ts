/**
 * The owner's payment-recipient configuration (Phase 16C).
 *
 * One row per method at most, enforced by the partial unique index `payment_recipient_active_unique`.
 * The schema is used as designed and **not changed**: the store shows exactly one bKash number and one
 * Nagad number at checkout, so there is no multi-recipient routing to build (and no requirement for it).
 *
 * Three rules make this safe, and each is enforced here rather than in the screen:
 *
 *  1. **Authorization is re-checked in the service**, not only on the route, so a caller that forgets
 *     the route check fails closed (`requirePermission`).
 *  2. **A recipient row referenced by a submitted claim is never mutated in place.** Editing its number
 *     would silently rewrite what an already-submitted claim appears to have been paid into - the admin
 *     queue renders the recipient number it joins through, so the history would lie. When claims exist,
 *     the edit deactivates the old row and inserts a successor, leaving the claim pointing at the number
 *     it actually referenced.
 *  3. **Deactivation never deletes and never touches an order or a claim.** It clears availability only,
 *     which is exactly what the checkout reads.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { paymentClaim, paymentRecipient } from '@/db/schema';
import { recordAudit } from '../auth/audit';
import {
  ConflictError,
  ValidationError,
  requirePermission,
  type ActorContext,
} from '../authz/authorize';
import { PERMISSIONS } from '../authz/permissions';
import {
  RECIPIENT_METHODS,
  parseRecipientDetails,
  parseRecipientInput,
  type RecipientMethod,
} from './recipient-validation';

const PERMISSION = PERMISSIONS.paymentRecipientManage;
const ENTITY = 'payment_recipient';

/**
 * PostgreSQL's unique-violation code, unwrapped through the driver's error chain.
 *
 * The partial unique index on active rows is the real guarantee, so two requests that both pass the
 * "is one active?" check still cannot produce two active recipients - the second insert fails. That is
 * a conflict the owner can understand and retry, not a 500 the server should surface.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current !== null && typeof current === 'object'; ) {
    if ((current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type RecipientRow = {
  readonly id: number;
  readonly method: RecipientMethod;
  readonly accountNumber: string;
  readonly accountLabel: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly deactivatedAt: Date | null;
  /** How many submitted/resolved claims reference this row. Decides edit-in-place vs successor. */
  readonly claimCount: number;
};

export type RecipientConfiguration = {
  /** Every row, newest first, active or not - the owner's history, never deleted. */
  readonly rows: readonly RecipientRow[];
  /** The methods currently available at checkout, derived from the same rows the checkout reads. */
  readonly availableMethods: readonly RecipientMethod[];
};

/** Reads the configuration. Requires `payment.recipient_manage`: this is the owner's own money routing. */
export async function recipientConfiguration(
  tx: Transaction,
  actor: ActorContext,
): Promise<RecipientConfiguration> {
  await requirePermission(actor, PERMISSION, ENTITY, 0);

  const claimCount = sql<number>`(
    select count(*)::int from ${paymentClaim} where ${paymentClaim.paymentRecipientId} = ${paymentRecipient.id}
  )`;

  const rows = await tx
    .select({
      id: paymentRecipient.id,
      method: paymentRecipient.method,
      accountNumber: paymentRecipient.accountNumber,
      accountLabel: paymentRecipient.accountLabel,
      isActive: paymentRecipient.isActive,
      createdAt: paymentRecipient.createdAt,
      deactivatedAt: paymentRecipient.deactivatedAt,
      claimCount,
    })
    .from(paymentRecipient)
    .orderBy(sql`${paymentRecipient.isActive} desc, ${paymentRecipient.createdAt} desc`);

  return {
    rows: rows.map((row) => ({ ...row, method: row.method as RecipientMethod })),
    availableMethods: rows.filter((row) => row.isActive).map((row) => row.method as RecipientMethod),
  };
}

/** A label for the audit trail: the method is the identity of the change, the number is the substance. */
function snapshot(row: { method: string; accountNumber: string; accountLabel: string; isActive: boolean }) {
  return {
    method: row.method,
    accountNumber: row.accountNumber,
    accountLabel: row.accountLabel,
    isActive: row.isActive,
  };
}

/** Adds the first (or a replacement) active recipient for a method. */
export async function createRecipient(
  tx: Transaction,
  actor: ActorContext,
  input: { method: unknown; accountNumber: unknown; accountLabel: unknown },
): Promise<{ recipientId: number }> {
  await requirePermission(actor, PERMISSION, ENTITY, 0);

  const parsed = parseRecipientInput(input);
  if (parsed === null) {
    throw new ValidationError(
      'a recipient needs a bKash or Nagad method, a valid Bangladeshi mobile number and a label',
    );
  }

  const active = await tx
    .select({ id: paymentRecipient.id })
    .from(paymentRecipient)
    .where(sql`${paymentRecipient.method} = ${parsed.method} and ${paymentRecipient.isActive}`);
  if (active.length > 0) {
    throw new ConflictError(`an active ${parsed.method} recipient already exists; edit or deactivate it first`);
  }

  let inserted: { id: number }[];
  try {
    inserted = await tx
      .insert(paymentRecipient)
      .values({
        method: parsed.method,
        accountNumber: parsed.accountNumber,
        accountLabel: parsed.accountLabel,
        isActive: true,
        createdByStaffId: actor.staffUserId,
      })
      .returning({ id: paymentRecipient.id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`an active ${parsed.method} recipient already exists`);
    }
    throw error;
  }
  const recipientId = inserted[0]?.id;
  if (recipientId === undefined) throw new Error('payment_recipient insert returned no id');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'payment.recipient_created',
    entityType: ENTITY,
    entityId: recipientId,
    after: snapshot({ ...parsed, isActive: true }),
  });

  return { recipientId };
}

export type UpdateOutcome = 'updated' | 'unchanged' | 'replaced';

/**
 * Edits an active recipient's number and label.
 *
 * When any claim already references the row, the edit **creates a successor row and deactivates this
 * one**: a submitted claim must keep showing the account it was actually paid into. The owner sees this
 * as a normal save; the screen and the audit trail both state that a new row was created.
 */
export async function updateRecipient(
  tx: Transaction,
  actor: ActorContext,
  input: { recipientId: number; accountNumber: unknown; accountLabel: unknown },
): Promise<{ outcome: UpdateOutcome; recipientId: number }> {
  await requirePermission(actor, PERMISSION, ENTITY, input.recipientId);

  const parsed = parseRecipientDetails(input);
  if (parsed === null) {
    throw new ValidationError('a recipient needs a valid Bangladeshi mobile number and a label');
  }

  const found = await tx
    .select({
      id: paymentRecipient.id,
      method: paymentRecipient.method,
      accountNumber: paymentRecipient.accountNumber,
      accountLabel: paymentRecipient.accountLabel,
      isActive: paymentRecipient.isActive,
    })
    .from(paymentRecipient)
    .where(sql`${paymentRecipient.id} = ${input.recipientId}`);
  const row = found[0];
  if (row === undefined) throw new ValidationError('no such payment recipient');
  if (!row.isActive) throw new ConflictError('this recipient is deactivated; reactivate it before editing');

  if (row.accountNumber === parsed.accountNumber && row.accountLabel === parsed.accountLabel) {
    return { outcome: 'unchanged', recipientId: row.id };
  }

  const claims = await tx
    .select({ id: paymentClaim.id })
    .from(paymentClaim)
    .where(sql`${paymentClaim.paymentRecipientId} = ${row.id}`)
    .limit(1);

  const before = snapshot(row);

  if (claims.length === 0) {
    const updated = await tx
      .update(paymentRecipient)
      .set({ accountNumber: parsed.accountNumber, accountLabel: parsed.accountLabel })
      .where(sql`${paymentRecipient.id} = ${row.id} and ${paymentRecipient.isActive}`)
      .returning({ id: paymentRecipient.id });
    if (updated.length === 0) throw new ConflictError('this recipient was changed by another request');

    await recordAudit(tx, {
      actorType: 'staff',
      actorStaffId: actor.staffUserId,
      actorRoleCodes: actor.roleCodes,
      action: 'payment.recipient_updated',
      entityType: ENTITY,
      entityId: row.id,
      before,
      after: snapshot({ ...row, ...parsed }),
    });

    return { outcome: 'updated', recipientId: row.id };
  }

  // Claims exist: never rewrite what they were paid into. Retire this row and create its successor.
  const retired = await tx
    .update(paymentRecipient)
    .set({ isActive: false, deactivatedAt: sql`now()` })
    .where(sql`${paymentRecipient.id} = ${row.id} and ${paymentRecipient.isActive}`)
    .returning({ id: paymentRecipient.id });
  if (retired.length === 0) throw new ConflictError('this recipient was changed by another request');

  let inserted: { id: number }[];
  try {
    inserted = await tx
      .insert(paymentRecipient)
      .values({
        method: row.method,
        accountNumber: parsed.accountNumber,
        accountLabel: parsed.accountLabel,
        isActive: true,
        createdByStaffId: actor.staffUserId,
      })
      .returning({ id: paymentRecipient.id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`an active ${row.method} recipient already exists`);
    }
    throw error;
  }
  const successorId = inserted[0]?.id;
  if (successorId === undefined) throw new Error('payment_recipient insert returned no id');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'payment.recipient_deactivated',
    entityType: ENTITY,
    entityId: row.id,
    before,
    after: { ...before, isActive: false },
    reason: `superseded by edit; ${successorId} created so existing claims keep their original account`,
  });
  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'payment.recipient_created',
    entityType: ENTITY,
    entityId: successorId,
    after: snapshot({ method: row.method, ...parsed, isActive: true }),
    reason: `successor of ${row.id}`,
  });

  return { outcome: 'replaced', recipientId: successorId };
}

/** Takes a method off the checkout page. History, orders and claims are untouched. */
export async function deactivateRecipient(
  tx: Transaction,
  actor: ActorContext,
  input: { recipientId: number },
): Promise<void> {
  await requirePermission(actor, PERMISSION, ENTITY, input.recipientId);

  const found = await tx
    .select({
      id: paymentRecipient.id,
      method: paymentRecipient.method,
      accountNumber: paymentRecipient.accountNumber,
      accountLabel: paymentRecipient.accountLabel,
      isActive: paymentRecipient.isActive,
    })
    .from(paymentRecipient)
    .where(sql`${paymentRecipient.id} = ${input.recipientId}`);
  const row = found[0];
  if (row === undefined) throw new ValidationError('no such payment recipient');
  if (!row.isActive) throw new ConflictError('this recipient is already deactivated');

  const retired = await tx
    .update(paymentRecipient)
    .set({ isActive: false, deactivatedAt: sql`now()` })
    .where(sql`${paymentRecipient.id} = ${row.id} and ${paymentRecipient.isActive}`)
    .returning({ id: paymentRecipient.id });
  if (retired.length === 0) throw new ConflictError('this recipient was changed by another request');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'payment.recipient_deactivated',
    entityType: ENTITY,
    entityId: row.id,
    before: snapshot(row),
    after: { ...snapshot(row), isActive: false },
  });
}

/** Puts a method back on the checkout page. Refuses while another row for that method is active. */
export async function reactivateRecipient(
  tx: Transaction,
  actor: ActorContext,
  input: { recipientId: number },
): Promise<void> {
  await requirePermission(actor, PERMISSION, ENTITY, input.recipientId);

  const found = await tx
    .select({
      id: paymentRecipient.id,
      method: paymentRecipient.method,
      accountNumber: paymentRecipient.accountNumber,
      accountLabel: paymentRecipient.accountLabel,
      isActive: paymentRecipient.isActive,
    })
    .from(paymentRecipient)
    .where(sql`${paymentRecipient.id} = ${input.recipientId}`);
  const row = found[0];
  if (row === undefined) throw new ValidationError('no such payment recipient');
  if (row.isActive) throw new ConflictError('this recipient is already active');

  const active = await tx
    .select({ id: paymentRecipient.id })
    .from(paymentRecipient)
    .where(sql`${paymentRecipient.method} = ${row.method} and ${paymentRecipient.isActive}`);
  if (active.length > 0) {
    throw new ConflictError(`an active ${row.method} recipient already exists; deactivate it first`);
  }

  const revived = await tx
    .update(paymentRecipient)
    .set({ isActive: true, deactivatedAt: null })
    .where(sql`${paymentRecipient.id} = ${row.id} and not ${paymentRecipient.isActive}`)
    .returning({ id: paymentRecipient.id });
  if (revived.length === 0) throw new ConflictError('this recipient was changed by another request');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'payment.recipient_reactivated',
    entityType: ENTITY,
    entityId: row.id,
    before: snapshot(row),
    after: { ...snapshot(row), isActive: true },
  });
}

/** The methods the checkout can offer, read from the same rows the checkout form reads. */
export async function availablePrepaidMethods(tx: Transaction): Promise<readonly RecipientMethod[]> {
  const rows = await tx
    .select({ method: paymentRecipient.method })
    .from(paymentRecipient)
    .where(sql`${paymentRecipient.isActive}`);
  return rows
    .map((row) => row.method)
    .filter((method): method is RecipientMethod => (RECIPIENT_METHODS as readonly string[]).includes(method));
}

