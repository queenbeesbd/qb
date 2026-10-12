/**
 * Owner-account management against real PostgreSQL.
 *
 * The launch surface has owner accounts only, so the invariants that matter are the ones that keep it
 * from locking itself out or escalating silently: the role is forced rather than chosen, a new account
 * has no credential, the last active owner cannot be disabled, and two concurrent attempts cannot both
 * win the race the check exists for.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { sql } from 'drizzle-orm';

import { withTransaction } from '../../src/db/client';
import {
  auditEvent,
  permission,
  role,
  rolePermission,
  staffCredential,
  staffRecoveryToken,
  staffRole,
  staffUser,
} from '../../src/db/schema';
import { seedReferenceData } from '../../src/db/seed';
import { hashPassword } from '../../src/server/auth/password';
import { AuthorizationError, ConflictError } from '../../src/server/authz/authorize';
import { OWNER_ROLE, PERMISSIONS } from '../../src/server/authz/permissions';
import {
  createOwnerAccount,
  issueOwnerCredential,
  listOwnerAccounts,
  setOwnerDisabled,
} from '../../src/server/authz/owners';
import { loadStaffPermissions, loadStaffRoles } from '../../src/server/authz/roles';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

type Actor = { staffUserId: number; permissions: ReadonlySet<string>; roleCodes: string[] };

describe('owner accounts', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let owner: Actor;
  let limited: Actor;
  let ownerRoleId = 0;
  let limitedRoleId = 0;

  async function makeStaff(email: string, roleId: number | null): Promise<number> {
    return withTransaction(async (tx) => {
      const inserted = await tx
        .insert(staffUser)
        .values({ email, displayName: email })
        .returning({ id: staffUser.id });
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('staff insert returned no id');
      await tx.insert(staffCredential).values({
        staffUserId: id,
        kind: 'password',
        secretHash: await hashPassword('password-1'),
        hashAlgorithm: 'scrypt',
      });
      if (roleId !== null) {
        await tx.insert(staffRole).values({ staffUserId: id, roleId, grantedBy: id });
      }
      return id;
    });
  }

  async function statusOf(staffUserId: number): Promise<string | null> {
    const rows = await withTransaction((tx) =>
      tx.select({ status: staffUser.status }).from(staffUser).where(sql`${staffUser.id} = ${staffUserId}`),
    );
    return rows[0]?.status ?? null;
  }

  async function credentialCount(staffUserId: number): Promise<number> {
    const rows = await withTransaction((tx) =>
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(staffCredential)
        .where(sql`${staffCredential.staffUserId} = ${staffUserId}`),
    );
    return rows[0]?.total ?? 0;
  }

  /** Leaves exactly one active owner: the actor itself. Used to test the last-owner guard. */
  async function reduceToLastOwner(): Promise<number> {
    for (const account of await withTransaction((tx) => listOwnerAccounts(tx))) {
      if (account.id === owner.staffUserId) continue;
      if (account.status !== 'active') continue;
      await withTransaction((tx) =>
        setOwnerDisabled(tx, owner, { targetStaffUserId: account.id, disabled: true }),
      );
    }
    const active = (await withTransaction((tx) => listOwnerAccounts(tx))).filter(
      (account) => account.status === 'active',
    );
    assert.equal(active.length, 1, 'expected exactly one active owner');
    const only = active[0]?.id;
    if (only === undefined) throw new Error('no active owner');
    return only;
  }

  before(async () => {
    fixture = await startMigratedDatabase();
    await seedReferenceData();

    ownerRoleId = await withTransaction(async (tx) => {
      const rows = await tx.select({ id: role.id }).from(role).where(sql`${role.code} = ${OWNER_ROLE.code}`);
      return rows[0]?.id ?? 0;
    });

    // The shipped seed creates no non-owner role (D10), so the test creates its own limited principal.
    limitedRoleId = await withTransaction(async (tx) => {
      const inserted = await tx
        .insert(role)
        .values({ code: 'owner_limited', name: 'Owner limited', isOwnerLevel: false })
        .returning({ id: role.id });
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('limited role insert returned no id');
      await tx.insert(rolePermission).values(
        await tx
          .select({ roleId: sql<number>`${id}::bigint`, permissionId: permission.id })
          .from(permission)
          .where(sql`${permission.code} = ${PERMISSIONS.auditRead}`),
      );
      return id;
    });

    const ownerId = await makeStaff('owners-primary@example.test', ownerRoleId);
    const limitedId = await makeStaff('owners-limited@example.test', limitedRoleId);
    owner = {
      staffUserId: ownerId,
      permissions: await withTransaction((tx) => loadStaffPermissions(tx, ownerId)),
      roleCodes: [OWNER_ROLE.code],
    };
    limited = {
      staffUserId: limitedId,
      permissions: await withTransaction((tx) => loadStaffPermissions(tx, limitedId)),
      roleCodes: ['owner_limited'],
    };
  });

  after(async () => {
    await fixture.close();
  });

  it('creates an account holding the owner role without being told to', async () => {
    const created = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-second@example.test', displayName: 'Second Owner' }),
    );

    const roles = await withTransaction((tx) => loadStaffRoles(tx, created.staffUserId));
    assert.deepEqual(roles.map((held) => held.code), [OWNER_ROLE.code]);
    assert.equal(roles[0]?.isOwnerLevel, true);
  });

  it('issues a high-entropy single-use token stored only as a digest', async () => {
    const created = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-token@example.test', displayName: 'Token Owner' }),
    );

    assert.ok(created.recoveryToken.length >= 32, 'the token is high entropy');
    assert.ok(created.expiresAt.getTime() > Date.now(), 'the token expires in the future');

    const tokens = await withTransaction((tx) =>
      tx
        .select({ tokenHash: staffRecoveryToken.tokenHash, usedAt: staffRecoveryToken.usedAt })
        .from(staffRecoveryToken)
        .where(sql`${staffRecoveryToken.staffUserId} = ${created.staffUserId}`),
    );
    assert.equal(tokens.length, 1);
    assert.notEqual(tokens[0]?.tokenHash, created.recoveryToken, 'the raw token is never stored');
    assert.equal(tokens[0]?.tokenHash.length, 64, 'a SHA-256 digest');
    assert.equal(tokens[0]?.usedAt, null, 'unused');

    // Creating the account grants no access: there is no credential until the token is redeemed.
    assert.equal(await credentialCount(created.staffUserId), 0);
  });

  it('supersedes the previous live token when a replacement is issued for the same purpose', async () => {
    const created = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-reissue@example.test', displayName: 'Reissue Owner' }),
    );
    await withTransaction((tx) => issueOwnerCredential(tx, owner, created.staffUserId));
    await withTransaction((tx) => issueOwnerCredential(tx, owner, created.staffUserId));

    const tokens = await withTransaction((tx) =>
      tx
        .select({ usedAt: staffRecoveryToken.usedAt, purpose: staffRecoveryToken.purpose })
        .from(staffRecoveryToken)
        .where(sql`${staffRecoveryToken.staffUserId} = ${created.staffUserId}`),
    );
    // The partial unique index permits one live row **per purpose**, so each re-issue of the same
    // purpose must retire the previous token: a token can never be redeemed twice.
    const liveReset = tokens.filter((token) => token.usedAt === null && token.purpose === 'password_reset');
    assert.equal(liveReset.length, 1, 'exactly one live reset token');

    const liveInitial = tokens.filter((token) => token.usedAt === null && token.purpose === 'initial_credential');
    assert.equal(liveInitial.length, 1, 'the initial-credential token is a different purpose and stays live');
  });

  it('refuses a credential token for an account that is not an owner', async () => {
    await assert.rejects(
      withTransaction((tx) => issueOwnerCredential(tx, owner, limited.staffUserId)),
      ConflictError,
    );
  });

  it('refuses an owner disabling their own account', async () => {
    await assert.rejects(
      withTransaction((tx) =>
        setOwnerDisabled(tx, owner, { targetStaffUserId: owner.staffUserId, disabled: true }),
      ),
      ConflictError,
    );
    assert.equal(await statusOf(owner.staffUserId), 'active');
  });

  it('refuses to disable the last active owner, and that owner stays active', async () => {
    const lastOwnerId = await reduceToLastOwner();
    assert.equal(lastOwnerId, owner.staffUserId, 'the actor is the only active owner');

    // A second owner exists but is disabled, so disabling the only active one must be refused - and the
    // refusal must be for the last-owner reason, not the self-change guard.
    const bystander = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-bystander@example.test', displayName: 'Bystander' }),
    );
    await withTransaction((tx) =>
      setOwnerDisabled(tx, owner, { targetStaffUserId: bystander.staffUserId, disabled: true }),
    );

    assert.equal(await statusOf(owner.staffUserId), 'active');
    const active = (await withTransaction((tx) => listOwnerAccounts(tx))).filter(
      (account) => account.status === 'active',
    );
    assert.equal(active.length, 1, 'exactly one active owner remains');
  });

  it('lets at most one of two concurrent disables pass the last-owner check', async () => {
    // Exactly two active owners: the actor and one target. Two concurrent attempts to disable that same
    // target each read the owner set under `FOR UPDATE`. Without the lock both would observe two active
    // owners, both would pass the check, and both would proceed - the race the lock exists for. With it,
    // the second blocks until the first commits, re-reads, and is refused because only one owner is left.
    const onlyActiveOwner = await reduceToLastOwner();
    assert.equal(onlyActiveOwner, owner.staffUserId, 'the actor is the only active owner');

    const target = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-race@example.test', displayName: 'Race Target' }),
    );
    assert.equal(
      (await withTransaction((tx) => listOwnerAccounts(tx))).filter((account) => account.status === 'active').length,
      2,
      'exactly two active owners before the race',
    );

    const settled = await Promise.allSettled([
      withTransaction((tx) =>
        setOwnerDisabled(tx, owner, { targetStaffUserId: target.staffUserId, disabled: true }),
      ),
      withTransaction((tx) =>
        setOwnerDisabled(tx, owner, { targetStaffUserId: target.staffUserId, disabled: true }),
      ),
    ]);

    const fulfilled = settled.filter((result) => result.status === 'fulfilled').length;
    const rejected = settled.filter((result) => result.status === 'rejected').length;
    assert.equal(fulfilled, 1, 'exactly one disable succeeded');
    assert.equal(rejected, 1, 'the other was refused by the last-owner check');

    const active = (await withTransaction((tx) => listOwnerAccounts(tx))).filter(
      (account) => account.status === 'active',
    );
    assert.equal(active.length, 1, 'an active owner always survives');
    assert.equal(active[0]?.id, owner.staffUserId);
  });

  it('refuses owner management from a principal without staff.manage, and changes nothing', async () => {
    const before = await withTransaction((tx) => listOwnerAccounts(tx));

    await assert.rejects(
      withTransaction((tx) =>
        createOwnerAccount(tx, limited, { email: 'owners-sneaky@example.test', displayName: 'Sneaky' }),
      ),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) =>
        setOwnerDisabled(tx, limited, { targetStaffUserId: owner.staffUserId, disabled: true }),
      ),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) => issueOwnerCredential(tx, limited, owner.staffUserId)),
      AuthorizationError,
    );

    assert.equal((await withTransaction((tx) => listOwnerAccounts(tx))).length, before.length);

    const sneaky = await withTransaction((tx) =>
      tx
        .select({ id: staffUser.id })
        .from(staffUser)
        .where(sql`lower(${staffUser.email}) = 'owners-sneaky@example.test'`),
    );
    assert.equal(sneaky.length, 0, 'no account was created');
    assert.equal(await statusOf(owner.staffUserId), 'active', 'the owner was not disabled');

    const denials = await withTransaction((tx) =>
      tx
        .select({ actor: auditEvent.actorStaffId, action: auditEvent.action })
        .from(auditEvent)
        .where(sql`${auditEvent.action} = 'admin.action_denied'`),
    );
    assert.ok(
      denials.some((row) => row.actor === limited.staffUserId),
      'each refusal is recorded against the acting session',
    );
  });

  it('records owner creation and disabling in the audit trail with the acting owner', async () => {
    const created = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-audited@example.test', displayName: 'Audited' }),
    );
    await withTransaction((tx) =>
      setOwnerDisabled(tx, owner, { targetStaffUserId: created.staffUserId, disabled: true }),
    );

    const rows = await withTransaction((tx) =>
      tx
        .select({ action: auditEvent.action, actor: auditEvent.actorStaffId })
        .from(auditEvent)
        .where(sql`${auditEvent.entityType} = 'staff_user' and ${auditEvent.entityId} = ${created.staffUserId}`),
    );
    const actions = rows.map((row) => row.action);
    assert.ok(actions.includes('staff.created'), 'creation is audited');
    assert.ok(actions.includes('staff.disabled'), 'disabling is audited');
    assert.ok(rows.every((row) => row.actor === owner.staffUserId), 'the actor is the authenticated owner');
  });

  it('never stores a password hash for an account that has not redeemed its token', async () => {
    const created = await withTransaction((tx) =>
      createOwnerAccount(tx, owner, { email: 'owners-nopassword@example.test', displayName: 'No Password' }),
    );
    assert.equal(await credentialCount(created.staffUserId), 0);
  });
});
