/**
 * Service-level authorization primitives.
 *
 * The route handler checks the session's permission set before calling in, and **every service function
 * re-checks the actor**. The second check is what makes a caller that forgets the first one fail closed
 * rather than open, and it is the check that Phase 13's catalog and owner-account mutations rely on.
 *
 * A refusal is recorded **durably**, through the denial log, in its own transaction. That is not
 * decoration: the record used to be written inside the caller's transaction immediately before the
 * throw, so the refusal rolled back its own evidence (the F8 defect, fixed in Phase 12). The throw is
 * unchanged; the record is evidence of the attempt, never a substitute for the refusal.
 *
 * `requirePermission` deliberately does **not** take the caller's transaction, because it does not write
 * in it. A service function therefore cannot accidentally couple a refusal to a rollback.
 */

import { recordDeniedAction } from '../auth/denial-log';

/** Raised when the actor does not hold the permission the operation requires. */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/** Raised when the request is well-formed but conflicts with existing state (duplicate, in use, ...). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Raised when a submitted value fails server-side validation that the route could not perform alone. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** The minimum an actor must expose for the service layer to authorize it. */
export type ActorContext = {
  readonly staffUserId: number;
  readonly permissions: ReadonlySet<string>;
  readonly roleCodes: readonly string[];
};

/**
 * Requires `code`, or records the refusal and throws.
 *
 * `entityType`/`entityId` are the *attempted* target, recorded for investigation. They are never used to
 * decide anything: the actor comes from the resolved session, and the permission comes from the
 * catalogue - neither is read from the request.
 */
export async function requirePermission(
  actor: ActorContext,
  code: string,
  entityType: string,
  entityId: number,
): Promise<void> {
  if (actor.permissions.has(code)) return;

  await recordDeniedAction({
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: `service.${code}`,
    entityType,
    entityId,
    category: 'forbidden',
    reason: `missing permission ${code}`,
  });
  throw new AuthorizationError(`missing permission ${code}`);
}
