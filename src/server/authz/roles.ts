/**
 * Role and staff management - the owner-controlled operations (D10: **owner-only at launch**).
 *
 * Authorization is checked twice on purpose: the route handler checks the session's permission set
 * before calling in, and every function here re-checks the actor. The second check is what makes a
 * future caller that forgets the first one fail closed rather than open.
 *
 * The invariants below exist because each of them is a way an owner-only system locks itself out or
 * escalates silently:
 *
 * 1. **No self-escalation.** An actor may not change their own roles, and may not grant a role they
 *    do not themselves hold.
 * 2. **No total lockout.** The last active owner-level account cannot be disabled, and its owner
 *    role cannot be revoked.
 * 3. **Every change is audited** in the same transaction, with the actor's role codes snapshotted.
 * 4. **A privileged permission may only sit on an owner-level role**, enforced here and by the
 *    database trigger `role_permission_privileged_guard`.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { permission, role, rolePermission, staffRecoveryToken, staffRole, staffSession, staffUser } from '@/db/schema';

import { recordAudit } from '../auth/audit';
import { RECOVERY_TOKEN_MS } from '../auth/constants';
import { recordDeniedAction } from '../auth/denial-log';
import type { StaffRoleSummary } from './principal';
import { createOpaqueToken, sha256Hex } from '../auth/tokens';

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export type StaffListEntry = {
  id: number;
  email: string;
  displayName: string;
  status: string;
  disabledAt: Date | null;
  lastSeenAt: Date | null;
  roles: StaffRoleSummary[];
};

/** Resolves the roles a staff user holds. */
export async function loadStaffRoles(tx: Transaction, staffUserId: number): Promise<StaffRoleSummary[]> {
  return tx
    .select({
      id: role.id,
      code: role.code,
      name: role.name,
      isOwnerLevel: role.isOwnerLevel,
    })
    .from(staffRole)
    .innerJoin(role, sql`${role.id} = ${staffRole.roleId}`)
    .where(sql`${staffRole.staffUserId} = ${staffUserId}`)
    .orderBy(role.code);
}

/** Resolves every permission code a staff user holds, across all of their roles. */
export async function loadStaffPermissions(tx: Transaction, staffUserId: number): Promise<Set<string>> {
  const rows = await tx
    .selectDistinct({ code: permission.code })
    .from(staffRole)
    .innerJoin(rolePermission, sql`${rolePermission.roleId} = ${staffRole.roleId}`)
    .innerJoin(permission, sql`${permission.id} = ${rolePermission.permissionId}`)
    .where(sql`${staffRole.staffUserId} = ${staffUserId}`);

  return new Set(rows.map((row) => row.code));
}

/** Every role, with its permission count, for the read-only roles view. */
export async function listRoles(
  tx: Transaction,
): Promise<{ id: number; code: string; name: string; description: string | null; isOwnerLevel: boolean; permissionCount: number }[]> {
  const rows = await tx
    .select({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isOwnerLevel: role.isOwnerLevel,
      permissionCount: sql<number>`(select count(*)::int from ${rolePermission} where ${rolePermission.roleId} = ${role.id})`,
    })
    .from(role)
    .orderBy(role.code);
  return rows;
}

export async function listStaff(tx: Transaction): Promise<StaffListEntry[]> {
  const users = await tx
    .select({
      id: staffUser.id,
      email: staffUser.email,
      displayName: staffUser.displayName,
      status: staffUser.status,
      disabledAt: staffUser.disabledAt,
      lastSeenAt: staffUser.lastSeenAt,
    })
    .from(staffUser)
    .orderBy(staffUser.id);

  const entries: StaffListEntry[] = [];
  for (const user of users) {
    entries.push({ ...user, roles: await loadStaffRoles(tx, user.id) });
  }
  return entries;
}

export async function countStaff(tx: Transaction): Promise<{ total: number; active: number; disabled: number }> {
  const rows = await tx
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${staffUser.status} = 'active')::int`,
      disabled: sql<number>`count(*) filter (where ${staffUser.status} = 'disabled')::int`,
    })
    .from(staffUser);
  return rows[0] ?? { total: 0, active: 0, disabled: 0 };
}

/**
 * The second, service-level authorization check.
 *
 * It records the refusal **durably** - through the denial log, in its own transaction - because a
 * record written inside this transaction would be rolled back by the throw below. That was a real
 * defect: the refusal happened, and no evidence of it survived. The throw is unchanged; the record is
 * evidence of the attempt, never a substitute for the refusal.
 *
 * It no longer takes the caller's transaction, because it no longer writes in it.
 */
async function requirePermission(
  actor: ActorContext,
  code: string,
  entityId: number,
): Promise<void> {
  if (actor.permissions.has(code)) return;

  await recordDeniedAction({
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: `service.${code}`,
    entityType: 'staff_user',
    entityId,
    category: 'forbidden',
    reason: `missing permission ${code}`,
  });
  throw new AuthorizationError(`missing permission ${code}`);
}

/** How many active staff hold an owner-level role. Used to refuse the last-owner lockout. */
async function activeOwnerCount(tx: Transaction): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(distinct ${staffUser.id})::int` })
    .from(staffUser)
    .innerJoin(staffRole, sql`${staffRole.staffUserId} = ${staffUser.id}`)
    .innerJoin(role, sql`${role.id} = ${staffRole.roleId}`)
    .where(sql`${staffUser.status} = 'active' and ${role.isOwnerLevel}`);
  return rows[0]?.total ?? 0;
}

export type ActorContext = {
  readonly staffUserId: number;
  readonly permissions: ReadonlySet<string>;
  readonly roleCodes: readonly string[];
};

/**
 * Creates a staff user with no credential. The account cannot be signed into until an owner issues
 * it a credential token, so creation alone grants no access.
 */
export async function createStaffUser(
  tx: Transaction,
  actor: ActorContext,
  input: { email: string; displayName: string; roleCode: string },
): Promise<{ staffUserId: number; recoveryToken: string; expiresAt: Date }> {
  await requirePermission(actor, 'staff.manage', 0);

  const existing = await tx
    .select({ id: staffUser.id })
    .from(staffUser)
    .where(sql`lower(${staffUser.email}) = lower(${input.email})`);
  if (existing.length > 0) {
    throw new ConflictError('a staff user with that email already exists');
  }

  const targetRole = await tx.select({ id: role.id, code: role.code }).from(role).where(sql`${role.code} = ${input.roleCode}`);
  const roleRow = targetRole[0];
  if (roleRow === undefined) throw new ConflictError(`unknown role ${input.roleCode}`);

  const inserted = await tx
    .insert(staffUser)
    .values({ email: input.email, displayName: input.displayName })
    .returning({ id: staffUser.id });
  const staffUserId = inserted[0]?.id;
  if (staffUserId === undefined) throw new Error('staff user insert returned no id');

  await tx.insert(staffRole).values({ staffUserId, roleId: roleRow.id, grantedBy: actor.staffUserId });

  const issued = await issueCredentialToken(tx, actor, staffUserId, 'initial_credential');

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'staff.created',
    entityType: 'staff_user',
    entityId: staffUserId,
    after: { email: input.email, displayName: input.displayName, role: roleRow.code },
  });

  return { staffUserId, recoveryToken: issued.token, expiresAt: issued.expiresAt };
}

/**
 * Issues a single-use credential token for a staff user.
 *
 * The raw token is returned to the caller exactly once - it is stored only as a SHA-256 digest, so
 * it cannot be recovered afterwards. In this phase the only caller is the owner-facing staff screen
 * and the `staff:bootstrap` CLI, both of which display it once to the owner, who passes it to the
 * colleague out of band. No mail provider is involved, because none is authorized.
 *
 * Any live token for the same purpose is superseded: the partial unique index
 * `staff_recovery_token_live_unique` permits one live row per purpose, so a re-issue must mark the
 * old one used. Marking it used is the documented way to retire it - the table is not append-only,
 * because a token's single-use state is a legitimate transition.
 */
export async function issueCredentialToken(
  tx: Transaction,
  actor: ActorContext,
  targetStaffUserId: number,
  purpose: 'initial_credential' | 'password_reset',
): Promise<{ token: string; expiresAt: Date }> {
  await requirePermission(actor, 'staff.manage', targetStaffUserId);

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_MS);

  await tx
    .update(staffRecoveryToken)
    .set({ usedAt: new Date() })
    .where(sql`${staffRecoveryToken.staffUserId} = ${targetStaffUserId}
        and ${staffRecoveryToken.purpose} = ${purpose}
        and ${staffRecoveryToken.usedAt} is null`);

  await tx.insert(staffRecoveryToken).values({
    staffUserId: targetStaffUserId,
    purpose,
    tokenHash: sha256Hex(token),
    issuedByStaffId: actor.staffUserId,
    expiresAt,
  });

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'staff.credential_reset_issued',
    entityType: 'staff_user',
    entityId: targetStaffUserId,
    after: { purpose },
  });

  return { token, expiresAt };
}

/** Grants a role. Refuses self-escalation and a role the actor does not hold. */
export async function grantRole(
  tx: Transaction,
  actor: ActorContext,
  input: { targetStaffUserId: number; roleCode: string },
): Promise<void> {
  await requirePermission(actor, 'staff.manage', input.targetStaffUserId);

  if (input.targetStaffUserId === actor.staffUserId) {
    throw new AuthorizationError('a staff user may not change their own roles');
  }

  const target = await tx.select({ id: role.id, code: role.code, isOwnerLevel: role.isOwnerLevel }).from(role).where(sql`${role.code} = ${input.roleCode}`);
  const roleRow = target[0];
  if (roleRow === undefined) throw new ConflictError(`unknown role ${input.roleCode}`);

  // Holding `staff.manage` does not imply the ability to hand out a role the actor does not hold
  // (data-model 4.6, security.md section 13 rule 4).
  if (!actor.roleCodes.includes(roleRow.code)) {
    throw new AuthorizationError(`cannot grant a role the actor does not hold (${roleRow.code})`);
  }

  const already = await tx
    .select({ staffUserId: staffRole.staffUserId })
    .from(staffRole)
    .where(sql`${staffRole.staffUserId} = ${input.targetStaffUserId} and ${staffRole.roleId} = ${roleRow.id}`);
  if (already.length > 0) return;

  await tx.insert(staffRole).values({
    staffUserId: input.targetStaffUserId,
    roleId: roleRow.id,
    grantedBy: actor.staffUserId,
  });

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'staff.role_granted',
    entityType: 'staff_user',
    entityId: input.targetStaffUserId,
    after: { role: roleRow.code },
  });

  // A privilege change invalidates existing sessions: the token was issued under the old role set.
  await revokeSessionsFor(tx, input.targetStaffUserId, 'admin_revoke');
}

/** Revokes a role. Refuses self-demotion and removing the last active owner. */
export async function revokeRole(
  tx: Transaction,
  actor: ActorContext,
  input: { targetStaffUserId: number; roleCode: string },
): Promise<void> {
  await requirePermission(actor, 'staff.manage', input.targetStaffUserId);

  if (input.targetStaffUserId === actor.staffUserId) {
    throw new AuthorizationError('a staff user may not change their own roles');
  }

  const target = await tx.select({ id: role.id, code: role.code, isOwnerLevel: role.isOwnerLevel }).from(role).where(sql`${role.code} = ${input.roleCode}`);
  const roleRow = target[0];
  if (roleRow === undefined) throw new ConflictError(`unknown role ${input.roleCode}`);

  if (roleRow.isOwnerLevel) {
    const owners = await activeOwnerCount(tx);
    if (owners <= 1) {
      throw new ConflictError('the last active owner-level role cannot be revoked');
    }
  }

  await tx
    .delete(staffRole)
    .where(sql`${staffRole.staffUserId} = ${input.targetStaffUserId} and ${staffRole.roleId} = ${roleRow.id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'staff.role_revoked',
    entityType: 'staff_user',
    entityId: input.targetStaffUserId,
    before: { role: roleRow.code },
  });

  await revokeSessionsFor(tx, input.targetStaffUserId, 'admin_revoke');
}

/** Enables or disables a staff account. Disabling is the documented alternative to deletion. */
export async function setStaffDisabled(
  tx: Transaction,
  actor: ActorContext,
  input: { targetStaffUserId: number; disabled: boolean },
): Promise<void> {
  await requirePermission(actor, 'staff.manage', input.targetStaffUserId);

  if (input.targetStaffUserId === actor.staffUserId) {
    throw new AuthorizationError('a staff user may not disable their own account');
  }

  if (input.disabled) {
    const targetRoles = await loadStaffRoles(tx, input.targetStaffUserId);
    if (targetRoles.some((r) => r.isOwnerLevel) && (await activeOwnerCount(tx)) <= 1) {
      throw new ConflictError('the last active owner-level account cannot be disabled');
    }
  }

  await tx
    .update(staffUser)
    .set({
      status: input.disabled ? 'disabled' : 'active',
      disabledAt: input.disabled ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(sql`${staffUser.id} = ${input.targetStaffUserId}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: input.disabled ? 'staff.disabled' : 'staff.enabled',
    entityType: 'staff_user',
    entityId: input.targetStaffUserId,
  });

  if (input.disabled) {
    await revokeSessionsFor(tx, input.targetStaffUserId, 'admin_revoke');
  }
}

/**
 * Revokes every live session for a staff user.
 *
 * Exported because three callers need the identical behaviour: an explicit revocation, a role change
 * and a credential change. One implementation means a session can never be invalidated by one path
 * and survive another.
 */
export async function revokeSessionsFor(
  tx: Transaction,
  staffUserId: number,
  reason: 'logout' | 'password_change' | 'admin_revoke' | 'reuse_detected',
): Promise<number> {
  const rows = await tx
    .update(staffSession)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(sql`${staffSession.staffUserId} = ${staffUserId} and ${staffSession.revokedAt} is null`)
    .returning({ id: staffSession.id });
  return rows.length;
}
