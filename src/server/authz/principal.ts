/**
 * The authenticated staff principal and the authorization decision.
 *
 * Kept in its own module so the session reader, the role-management service and the route handlers
 * can all depend on the shape without any of them depending on each other.
 *
 * **The decision is a set membership test against data loaded from the database**, never against a
 * constant and never against anything the browser sent. A role code, a staff id, a hidden form field
 * or a permission flag in a request body is not an input to `hasPermission`.
 */

export type StaffRoleSummary = {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly isOwnerLevel: boolean;
};

export type StaffPrincipal = {
  readonly sessionId: string;
  readonly staffUserId: number;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly StaffRoleSummary[];
  /** Permission codes held, resolved from `staff_role -> role_permission -> permission`. */
  readonly permissions: ReadonlySet<string>;
  readonly isOwnerLevel: boolean;
  readonly absoluteExpiresAt: Date;
  readonly idleExpiresAt: Date;
  /**
   * CSRF token derived from the raw session token. Rendered into forms as a hidden field and verified
   * on every state-changing request. It is not a secret from the session holder, and it is never
   * persisted - it is recomputed from the session token on each request.
   */
  readonly csrfToken: string;
};

/** Role codes held, for the audit snapshot and for display. */
export function roleCodes(principal: StaffPrincipal): string[] {
  return principal.roles.map((role) => role.code).sort();
}

/** Deny by default: a code absent from the resolved set is refused. */
export function hasPermission(principal: StaffPrincipal, code: string): boolean {
  return principal.permissions.has(code);
}

/** True when the principal holds at least one role flagged `is_owner_level`. */
export function holdsOwnerRole(principal: StaffPrincipal): boolean {
  return principal.roles.some((role) => role.isOwnerLevel);
}
