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
import { role, staffRole, staffUser } from '@/db/schema';

import { ConflictError, requirePermission, type ActorContext } from './authorize';
import { OWNER_ROLE, PERMISSIONS } from './permissions';
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
    })
    .from(staffUser)
    .where(
      sql`exists (
        select 1 from ${staffRole}
        inner join ${role} on ${role.id} = ${staffRole.roleId}
        where ${staffRole.staffUserId} = ${staffUser.id} and ${role.isOwnerLevel}
      )`,
    )
    .orderBy(staffUser.id);

  return rows;
}

/**
 * Creates another owner account and issues its one-time credential token.
 *
 * The role is **forced**, never read from the request: there is no role selector in the launch surface,
 * so there is nothing for a client to choose. The returned token is shown once and stored only as a
 * digest.
 */
export async function createOwnerAccount(
  tx: Transaction,
  actor: ActorContext,
  input: { email: string; displayName: string },
): Promise<{ staffUserId: number; recoveryToken: string; expiresAt: Date }> {
  await requirePermission(actor, PERMISSIONS.staffManage, 'staff_user', 0);

  return createStaffUser(tx, actor, {
    email: input.email,
    displayName: input.displayName,
    roleCode: OWNER_ROLE.code,
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
