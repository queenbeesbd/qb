/**
 * Audit trail writer.
 *
 * `audit_event` is append-only, enforced twice: by a `BEFORE UPDATE OR DELETE` trigger that raises
 * regardless of role, and by revoked `UPDATE`/`DELETE` grants on the deployed application role
 * (convention C5). Nothing here can rewrite or delete a record, and no other module in this phase
 * writes to the table.
 *
 * Two rules are enforced by construction rather than by reviewer discipline:
 *
 * 1. **The actor is never taken from the request.** `actorStaffId` comes from a resolved session or
 *    from an owner-issued CLI action, never from a form field, a header or a path parameter.
 * 2. **No secret is ever written.** The `before`/`after` payloads carry bounded, non-personal facts.
 *    A raw session token, a password and a recovery token have no representation here; the digest of
 *    a subject may be recorded, which is the same pseudonym the throttle already uses.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { auditEvent, operationalException } from '@/db/schema';

/**
 * Actions the audit trail knows how to write. A closed union, so an unplanned action cannot be invented
 * inline at a call site.
 *
 * `catalog.*` was added in Phase 13. The entity type stays `product`/`category`/`brand` rather than
 * gaining a module prefix, because `docs/security.md` requires the trail to answer "what happened to this
 * product", not "what happened in this module".
 */
export type AuditAction =
  | 'staff.login_succeeded'
  | 'staff.login_failed'
  | 'staff.login_blocked'
  | 'staff.logout'
  | 'staff.session_revoked'
  | 'staff.credential_set'
  | 'staff.credential_reset_issued'
  | 'staff.role_granted'
  | 'staff.role_revoked'
  | 'staff.created'
  | 'staff.disabled'
  | 'staff.enabled'
  | 'customer.banned'
  | 'customer.ban_reversed'
  | 'customer.credential_reset_issued'
  | 'customer.credential_reset_redeemed'
  | 'customer.recovery_refused'
  | 'cod.approved'
  | 'cod.cancelled'
  | 'cod.collected'
  | 'order.cost_recorded'
  | 'order.cost_voided'
  | 'cod.delivery_failed'
  | 'order.dispatched'
  | 'order.delivered'
  | 'order.completed'
  | 'order.cancelled'
  | 'return.received'
  | 'return.inspected'
  | 'catalog.brand_created'
  | 'catalog.category_created'
  | 'catalog.category_updated'
  | 'catalog.category_archived'
  | 'catalog.product_created'
  | 'catalog.product_updated'
  | 'catalog.product_archived'
  | 'catalog.availability_changed'
  | 'catalog.image_attached'
  | 'catalog.image_updated'
  | 'catalog.image_removed'
  | 'catalog.image_reordered'
  | 'settings.announcement_updated'
  | 'delivery.default_updated'
  | 'delivery.district_saved'
  | 'delivery.district_deactivated'
  | 'promo.created'
  | 'promo.updated'
  | 'promo.activated'
  | 'promo.deactivated'
  | 'integration.telegram_recipient_added'
  | 'integration.telegram_recipient_updated'
  | 'integration.telegram_recipient_activated'
  | 'integration.telegram_recipient_paused'
  | 'admin.action_denied';

export type AuditEntry = {
  readonly actorType: 'staff' | 'system';
  /** Required when `actorType` is `staff`; the schema enforces the pairing. */
  readonly actorStaffId?: number | null;
  /** Role codes held **at the time of the action**, snapshotted so a later re-role cannot rewrite history. */
  readonly actorRoleCodes: readonly string[];
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: number;
  /** Bounded, non-personal state snapshots. Never a secret, a token or an MFS reference. */
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
  readonly reason?: string | null;
  readonly requestId?: string | null;
  /** Digest of the source address for correlation. The address itself is never stored. */
  readonly ipHash?: string | null;
};

/**
 * Appends one audit record.
 *
 * Runs inside the caller's transaction on purpose: an action and its audit record commit together,
 * so a recorded change cannot exist without its trail, and a rolled-back action leaves no record of
 * having happened.
 */
export async function recordAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  const actorStaffId = entry.actorType === 'staff' ? (entry.actorStaffId ?? null) : null;
  if (entry.actorType === 'staff' && actorStaffId === null) {
    throw new Error('recordAudit: a staff action requires an actor id (the schema enforces this too)');
  }

  await tx.insert(auditEvent).values({
    actorType: entry.actorType,
    actorStaffId,
    actorRoleCodes: [...entry.actorRoleCodes],
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    requestId: entry.requestId ?? null,
    ipHash: entry.ipHash ?? null,
  });
}

/**
 * Refused actions are **not** recorded here.
 *
 * They were, and it was a defect: a denial written inside the caller's transaction is rolled back by
 * the very throw that refuses the action, so an attempted privilege escalation left no trace. Denials
 * are now written by `./denial-log.ts` in their own transaction, which is what makes the record
 * survive the refusal it describes. `admin.action_denied` stays in `AuditAction` above because it is
 * still the action code those records carry.
 */

/** The most recent audit entries, for the read-only admin view. Newest first. */
export async function listRecentAudit(
  tx: Transaction,
  limit: number,
  offset = 0,
): Promise<
  {
    id: number;
    occurredAt: Date;
    actorType: string;
    actorStaffId: number | null;
    actorRoleCodes: string[];
    action: string;
    entityType: string;
    entityId: number;
    reason: string | null;
  }[]
> {
  return tx
    .select({
      id: auditEvent.id,
      occurredAt: auditEvent.occurredAt,
      actorType: auditEvent.actorType,
      actorStaffId: auditEvent.actorStaffId,
      actorRoleCodes: auditEvent.actorRoleCodes,
      action: auditEvent.action,
      entityType: auditEvent.entityType,
      entityId: auditEvent.entityId,
      reason: auditEvent.reason,
    })
    .from(auditEvent)
    .orderBy(sql`${auditEvent.occurredAt} desc, ${auditEvent.id} desc`)
    .limit(limit)
    .offset(Math.max(offset, 0));
}

/** A total count, so the overview can state a real number rather than an invented metric. */
export async function countAuditEvents(tx: Transaction): Promise<number> {
  const rows = await tx.select({ total: sql<number>`count(*)::int` }).from(auditEvent);
  return rows[0]?.total ?? 0;
}

/**
 * The open operational exceptions - the manual-investigation worklist size.
 *
 * A mismatch hold lives here rather than in a new `held` claim state: the exception type is data
 * (`payment_mismatch` exists in the schema's closed type set), and the queue read is the same partial
 * filter the exceptions panel would use. Closing remains a person's note-bearing decision (the schema
 * CHECK), so nothing here can auto-resolve a hold.
 */
export async function countOpenOperationalExceptions(tx: Transaction): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(operationalException)
    .where(sql`${operationalException.state} in ('open', 'acknowledged')`);
  return rows[0]?.total ?? 0;
}
