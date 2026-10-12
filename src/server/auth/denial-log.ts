/**
 * Durable denial log.
 *
 * A refused administrative action is a security event. Before this module existed the refusal was
 * recorded in exactly one place - inside the caller's transaction, immediately before the throw that
 * refuses the action - so the record was rolled back **by the refusal itself**. An attempted privilege
 * escalation was refused correctly but left no trace, which is the opposite of what an audit trail is
 * for. This module exists to make the record survive the transaction it describes.
 *
 * Four properties, each chosen deliberately:
 *
 * 1. **It writes in its own transaction.** The record is committed independently of the caller's
 *    transaction, so a rollback of the failed business action cannot roll back the evidence that it
 *    was attempted. Nothing here participates in the caller's transaction, and nothing here can
 *    commit it.
 * 2. **It cannot turn a refusal into a success.** It returns a boolean, never throws, and no caller
 *    branches on the result. A logging failure changes observability only; the authorization decision
 *    has already been made and is unaffected.
 * 3. **An anonymous denial is not stored.** A denial with no authenticated actor is refused a record,
 *    because there is no actor to attribute and because it would hand any anonymous client a cheap way
 *    to write rows. The flood bound is therefore structural rather than a counter: writing a denial
 *    requires a valid session first.
 * 4. **The actor is never taken from the request.** `actorStaffId` is supplied by server code that
 *    resolved a session; no request field, header or path parameter reaches it.
 *
 * **Residual limitations, stated rather than hidden.** The per-actor bound is held in process memory,
 * so on a multi-instance deployment each instance applies its own allowance and the effective ceiling
 * is multiplied by the instance count. A failure to write leaves no record at all - the gap is
 * reported on stderr and is not retried, because a retry loop inside a refusal path is itself a
 * denial-of-service surface.
 */

import { withTransaction } from '@/db/client';
import { auditEvent } from '@/db/schema';

import { DENIAL_LOG } from './constants';

/** Why an action was refused. Mirrors the guard reasons, so a record cannot invent a new category. */
export type DenialCategory = 'forbidden' | 'csrf';

export type DenialInput = {
  /** The authenticated actor. `null` means anonymous, and an anonymous denial is not stored. */
  readonly actorStaffId: number | null;
  readonly actorRoleCodes: readonly string[];
  /** What was attempted, e.g. `mutation.staff.manage`. Recorded under `admin.action_denied`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: number;
  readonly category: DenialCategory;
  readonly reason?: string | null;
  /** Correlation only. Never an authority, and never used to identify the actor. */
  readonly requestId?: string | null;
  readonly ipHash?: string | null;
};

type Window = { windowStart: number; count: number };

/** Per-actor fixed window. Module state, deliberately: see the residual limitations above. */
const windows = new Map<number, Window>();

/**
 * Applies the per-actor bound, returning false when this denial should not be written.
 *
 * A fixed window with a monotonic counter, matching the login throttle's shape rather than inventing
 * a second rate-limiting concept. Expired entries are dropped first, and the oldest remaining entry
 * is evicted if the map is still full, so the map cannot grow without bound.
 */
function withinLimit(actorStaffId: number, now: number): boolean {
  const entry = windows.get(actorStaffId);
  if (entry === undefined || now - entry.windowStart >= DENIAL_LOG.windowMs) {
    if (windows.size >= DENIAL_LOG.maxTrackedActors) {
      for (const [key, value] of windows) {
        if (now - value.windowStart >= DENIAL_LOG.windowMs) windows.delete(key);
      }
      if (windows.size >= DENIAL_LOG.maxTrackedActors) {
        const oldest = windows.keys().next();
        if (!oldest.done) windows.delete(oldest.value);
      }
    }
    windows.set(actorStaffId, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= DENIAL_LOG.maxAttemptsPerWindow) return false;
  entry.count += 1;
  return true;
}

/** Clears the in-process window state. Test-only: a production process never resets its own bound. */
export function resetDenialLogLimits(): void {
  windows.clear();
}

/**
 * Records a refused administrative action in its own transaction.
 *
 * Returns `true` when a record was written, `false` when it was skipped (anonymous, over the bound)
 * or could not be written. Callers must not branch on the result: the refusal stands either way.
 */
export async function recordDeniedAction(input: DenialInput): Promise<boolean> {
  // Rule 3: no actor, no record. This is the flood bound, and it is also what keeps the table honest -
  // an unattributed row would claim a denial happened without saying who was denied.
  if (input.actorStaffId === null) return false;
  if (!withinLimit(input.actorStaffId, Date.now())) return false;

  try {
    await withTransaction(async (tx) => {
      await tx.insert(auditEvent).values({
        // A refusal is always attributable to a person here, because an anonymous one returns above.
        actorType: 'staff',
        actorStaffId: input.actorStaffId,
        actorRoleCodes: [...input.actorRoleCodes],
        // Distinguishable from every business event by its action code, and by the category below.
        action: 'admin.action_denied',
        entityType: input.entityType,
        entityId: input.entityId,
        before: null,
        after: { denied: input.action, category: input.category },
        reason: input.reason ?? null,
        requestId: input.requestId ?? null,
        ipHash: input.ipHash ?? null,
      });
    });
    return true;
  } catch (error) {
    // Never rethrown: a refusal must not become a failure, and authorization is already decided.
    // The action code is safe to print; the payloads, tokens and identifiers are not, so they are not.
    const name = error instanceof Error ? error.name : 'Error';
    console.error(`[denial-log] could not record a refused action (${input.action}): ${name}`);
    return false;
  }
}
