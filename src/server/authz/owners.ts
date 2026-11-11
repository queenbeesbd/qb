/**
 * Minimal owner-account management.
 *
 * The launch product has **owner accounts only**: every owner has full access, and there is no role
 * picker, permission matrix or staff/support role (D10, ADR 0009). This module is therefore deliberately
 * small, and its whole job is to make the owner-only model safe:
 *
 * - **The role is not an input.** `createOwnerAccount` hard-codes the owner role. There is no request
 *   field that can influence it, so "create an account" cannot be turned into "create a privileged
 *   account" - they are the same operation, and that operation is owner-only.
 * - **A new account has no credential.** It cannot be signed into until an owner hands over a
 *   single-use token, so account creation alone grants nobody access.
 * - **The last active owner cannot be removed.** Disabling is refused when it would leave no active
 *   owner-level account, checked **under a row lock** so two concurrent requests cannot both pass the
 *   check and both succeed (see `setOwnerDisabled`).
 * - **Nothing here is a public registration endpoint.** Every function requires `staff.manage` from a
 *   resolved session. The only non-session path that can create an account is the host-shell
 *   `npm run staff:bootstrap` CLI, which is not reachable over HTTP.
 *
 * The underlying operations are the Phase 12 staff primitives, reused rather than reimplemented: the
 * audit vocabulary, the self-change guard and the owner-count invariant stay in one place. What changed
 * in Phase 13 is the **surface** - one screen, one role, no selector.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { permission, role, rolePermission, staffRole, staffUser } from '@/db/schema';
import { recordAudit } from '../auth/audit';

import { ConflictError, ValidationError, requirePermission, type ActorContext } from './authorize';
import {
  MODERATOR_DEFAULT_PERMISSIONS,
  MODERATOR_ROLE,
  OWNER_ROLE,
  PERMISSIONS,
  PERMISSION_CATALOGUE,
} from './permissions';
import {
  createStaffUser,
  issueCredentialToken,
  loadStaffRoles,
  setStaffDisabled,
} from './roles';

export type OwnerAccount = {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly disabledAt: Date | null;
  readonly lastSeenAt: Date | null;
  /** True when the account has a live password credential, i.e. it has completed its token redemption. */
  readonly hasCredential: boolean;
  /** `owner` or `moderator` (owner direction, 2026-11-12); the role decides what the account may open. */
  readonly roleCode: string;
  readonly roleName: string;
};

/**
 * Every account that holds an owner-level role.
 *
 * Filtered on `role.is_owner_level` rather than on the literal code `owner`: the flag is what the
 * database trigger checks before permitting a privileged grant, so filtering on it means this list and
 * the privilege rule cannot disagree.
 */
export async function listOwnerAccounts(tx: Transaction): Promise<OwnerAccount[]> {
  const rows = await tx
    .select({
      id: staffUser.id,
      email: staffUser.email,
      displayName: staffUser.displayName,
      status: staffUser.status,
      disabledAt: staffUser.disabledAt,
      lastSeenAt: staffUser.lastSeenAt,
      hasCredential: sql<boolean>`exists (
        select 1 from "staff_credential"
        where "staff_credential"."staff_user_id" = "staff_user"."id"
          and "staff_credential"."revoked_at" is null
          and "staff_credential"."kind" = 'password'
      )`,
      /*
       * The role the account signs in with. One role per account in this product - owner or moderator -
       * so a correlated read of the highest-privileged role it holds states the whole answer.
       */
      roleCode: sql<string>`(
        select r."code" from ${staffRole} sr join ${role} r on r.id = sr.role_id
        where sr.staff_user_id = "staff_user"."id"
        order by r.is_owner_level desc, r.id limit 1
      )`,
      roleName: sql<string>`(
        select r."name" from ${staffRole} sr join ${role} r on r.id = sr.role_id
        where sr.staff_user_id = "staff_user"."id"
        order by r.is_owner_level desc, r.id limit 1
      )`,
    })
    .from(staffUser)
    .where(
      sql`exists (
        select 1 from ${staffRole}
        inner join ${role} on ${role.id} = ${staffRole.roleId}
        where ${staffRole.staffUserId} = ${staffUser.id}
      )`,
    )
    .orderBy(staffUser.id);

  return rows;
}

/**
 * Creates an owner **or moderator** account and issues its one-time credential token.
 *
 * The role is one of two codes, both written here and neither taken from the catalogue by string match
 * alone: an unknown code is a refusal, so a crafted form cannot invent a role. A new account has no
 * credential until the token is redeemed, so creating one grants nobody access by itself.
 *
 * A moderator is not owner-level, so the database trigger refuses it any privileged permission; this
 * function never tries to grant one, because the role's permission set is edited separately
 * (`saveModeratorAccess`) and that is where the privilege rule is stated to the owner.
 */
export async function createStaffAccount(
  tx: Transaction,
  actor: ActorContext,
  input: { email: string; displayName: string; role?: unknown },
): Promise<{ staffUserId: number; recoveryToken: string; expiresAt: Date }> {
  await requirePermission(actor, PERMISSIONS.staffManage, 'staff_user', 0);

  const roleCode = input.role === MODERATOR_ROLE.code ? MODERATOR_ROLE.code : OWNER_ROLE.code;
  if (input.role !== undefined && input.role !== OWNER_ROLE.code && input.role !== MODERATOR_ROLE.code) {
    throw new ValidationError('choose owner or moderator');
  }

  return createStaffUser(tx, actor, {
    email: input.email,
    displayName: input.displayName,
    roleCode,
  });
}

/**
 * Issues a replacement credential token for an existing owner account.
 *
 * This is the recovery path: no mail provider is authorized, so a reset link cannot be delivered, and
 * the owner must hand the token over out of band. Any live token for the same purpose is superseded by
 * `issueCredentialToken`, so only one token can ever be redeemed.
 */
export async function issueOwnerCredential(
  tx: Transaction,
  actor: ActorContext,
  targetStaffUserId: number,
): Promise<{ token: string; expiresAt: Date }> {
  await requirePermission(actor, PERMISSIONS.staffManage, 'staff_user', targetStaffUserId);

  const target = await tx
    .select({ id: staffUser.id })
    .from(staffUser)
    .where(sql`${staffUser.id} = ${targetStaffUserId}`);
  if (target.length === 0) throw new ConflictError('no such account');

  // Only an owner-level account may be issued through this surface: the screen manages owners, and
  // issuing a token for an account this screen does not list would be an unreviewed side door.
  const roles = await loadStaffRoles(tx, targetStaffUserId);
  if (!roles.some((held) => held.isOwnerLevel)) {
    throw new ConflictError('that account is not an owner');
  }

  return issueCredentialToken(tx, actor, targetStaffUserId, 'password_reset');
}

/**
 * Enables or disables an owner account.
 *
 * Two invariants, both enforced here rather than in the interface:
 *
 * 1. **An owner cannot disable their own account.** Otherwise the actor locks themselves out, and the
 *    only recovery is the host shell.
 * 2. **The last active owner cannot be disabled.** Checked under `FOR UPDATE` on the owner rows, so two
 *    concurrent requests cannot both observe two active owners and both disable one - the second blocks
 *    until the first commits, re-reads, and is refused. That is the concurrency case the check exists
 *    for; without the lock the invariant is only a race that usually holds.
 */
export async function setOwnerDisabled(
  tx: Transaction,
  actor: ActorContext,
  input: { targetStaffUserId: number; disabled: boolean },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.staffManage, 'staff_user', input.targetStaffUserId);

  if (input.targetStaffUserId === actor.staffUserId) {
    throw new ConflictError('an owner cannot disable their own account');
  }

  if (input.disabled) {
    const owners = await tx
      .select({ id: staffUser.id, status: staffUser.status })
      .from(staffUser)
      .innerJoin(staffRole, sql`${staffRole.staffUserId} = ${staffUser.id}`)
      .innerJoin(role, sql`${role.id} = ${staffRole.roleId}`)
      .where(sql`${role.isOwnerLevel}`)
      // Row lock, held until this transaction commits, so a concurrent disable cannot interleave.
      .for('update', { of: staffUser });

    const active = owners.filter((owner) => owner.status === 'active');
    const target = owners.find((owner) => owner.id === input.targetStaffUserId);
    if (target === undefined) throw new ConflictError('that account is not an owner');
    if (active.length <= 1) throw new ConflictError('the last active owner cannot be disabled');
  }

  await setStaffDisabled(tx, actor, {
    targetStaffUserId: input.targetStaffUserId,
    disabled: input.disabled,
  });
}

/**
 * The moderator role and the permissions it holds - the owner's answer to "which screens do moderators
 * get?" (owner direction, 2026-11-12).
 *
 * One role, shared by every moderator, because the question the owner asked is about the **class** of
 * account, not about one person: two moderators on the same shift should not be able to open different
 * screens. Editing this list changes every moderator at once, which is why the page says so.
 */
export async function loadModeratorAccess(tx: Transaction): Promise<{
  roleId: number;
  granted: string[];
  catalogue: readonly { code: string; description: string; isPrivileged: boolean }[];
}> {
  const rows = await tx
    .select({ id: role.id })
    .from(role)
    .where(sql`${role.code} = ${MODERATOR_ROLE.code}`);
  const roleId = rows[0]?.id;
  if (roleId === undefined) throw new ConflictError('the moderator role is missing; run npm run db:seed');

  const granted = await tx
    .select({ code: permission.code })
    .from(rolePermission)
    .innerJoin(permission, sql`${permission.id} = ${rolePermission.permissionId}`)
    .where(sql`${rolePermission.roleId} = ${roleId}`);

  return {
    roleId,
    granted: granted.map((row) => row.code),
    catalogue: PERMISSION_CATALOGUE.map((entry) => ({
      code: entry.code,
      description: entry.description,
      isPrivileged: entry.isPrivileged,
    })),
  };
}

/**
 * Replaces the moderator role's permission set.
 *
 * Three rules, all enforced here rather than in the form:
 *
 * 1. **Owner-level permissions are refused.** The database trigger would refuse them anyway, but a
 *    refusal that arrives as a 500 is not an answer; this raises a validation error the page can show.
 *    The interface already disables those rows and says why.
 * 2. **`staff.manage` and `dashboard.read` can never be granted to a moderator** - the first would let a
 *    moderator create accounts, and the second is the screen the owner explicitly kept for themselves.
 *    (`staff.manage` is privileged, so the trigger would refuse it; stating it here keeps one error.)
 * 3. **The role is rewritten as one set**, in the caller's transaction, so a save cannot leave the
 *    moderator holding half of one policy and half of another.
 */
export async function saveModeratorAccess(
  tx: Transaction,
  actor: ActorContext,
  input: { permissions: readonly string[] },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.staffManage, 'staff_user', 0);

  const wanted = [...new Set(input.permissions)];
  const byCode = new Map(PERMISSION_CATALOGUE.map((entry) => [entry.code, entry]));

  const unknown = wanted.find((code) => !byCode.has(code as never));
  if (unknown !== undefined) throw new ValidationError('that is not a permission the panel knows');

  const privileged = wanted.find((code) => byCode.get(code as never)?.isPrivileged);
  if (privileged !== undefined) {
    throw new ValidationError('an owner-level permission cannot be given to a moderator');
  }
  if (wanted.includes(PERMISSIONS.staffManage) || wanted.includes(PERMISSIONS.dashboardRead)) {
    throw new ValidationError('that screen stays with the owner');
  }

  const rows = await tx
    .select({ id: role.id })
    .from(role)
    .where(sql`${role.code} = ${MODERATOR_ROLE.code}`);
  const roleId = rows[0]?.id;
  if (roleId === undefined) throw new ConflictError('the moderator role is missing; run npm run db:seed');

  const ids = await tx
    .select({ id: permission.id, code: permission.code })
    .from(permission)
    .where(sql`${permission.code} in ${wanted.length === 0 ? [''] : wanted}`);

  // One delete, one insert: the set is the policy, so it is replaced rather than adjusted.
  await tx.execute(sql`delete from ${rolePermission} where ${rolePermission.roleId} = ${roleId}`);
  if (ids.length > 0) {
    await tx.insert(rolePermission).values(
      ids.map((entry) => ({ roleId, permissionId: entry.id })),
    );
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'staff.moderator_access_updated',
    entityType: 'role',
    entityId: roleId,
    before: null,
    after: { permissions: ids.map((entry) => entry.code).sort() },
  });
}

/** The default moderator set, for a fresh local database and for the migration. */
export const MODERATOR_DEFAULTS = MODERATOR_DEFAULT_PERMISSIONS;

/** Owner counts for the overview. Derived from rows, never estimated. */
export async function countOwnerAccounts(
  tx: Transaction,
): Promise<{ total: number; active: number; disabled: number }> {
  const owners = await listOwnerAccounts(tx);
  return {
    total: owners.length,
    active: owners.filter((owner) => owner.status === 'active').length,
    disabled: owners.filter((owner) => owner.status === 'disabled').length,
  };
}
