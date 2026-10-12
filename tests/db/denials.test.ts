import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { sql } from 'drizzle-orm';

import { withTransaction } from '../../src/db/client';
import { permission, role, rolePermission } from '../../src/db/schema';
import { seedReferenceData } from '../../src/db/seed';
import { DENIAL_LOG } from '../../src/server/auth/constants';
import { recordDeniedAction, resetDenialLogLimits } from '../../src/server/auth/denial-log';
import { hashPassword } from '../../src/server/auth/password';
import { loadStaffPermissions } from '../../src/server/authz/roles';
import { AuthorizationError, grantRole } from '../../src/server/authz/roles';
import { OWNER_ROLE, PERMISSIONS } from '../../src/server/authz/permissions';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Denied administrative actions, against real PostgreSQL.
 *
 * These tests exist because of a confirmed defect: the denial record was written inside the caller's
 * transaction, so the throw that refuses the action rolled the record back with it. The refusal worked
 * and left no evidence. Asserting the refusal alone would have missed it - the assertion that matters
 * is that the record **survives**, which can only be proven against a real database.
 */

const LIMITED_PASSWORD = 'limited-password-1';
const OWNER_PASSWORD = 'owner-password-1';

type DenialRow = {
  actor_staff_id: string | null;
  actor_role_codes: string[];
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  request_id: string | null;
  ip_hash: string | null;
  after: { denied?: string; category?: string } | null;
  occurred_at: Date;
};

describe('denied administrative actions', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;
  let ownerId: number;
  let limitedId: number;
  let victimId: number;
  let limitedActor: { staffUserId: number; permissions: ReadonlySet<string>; roleCodes: string[] };

  async function denialRows(): Promise<DenialRow[]> {
    const result = await fixture.pool.query<DenialRow>(
      `select actor_staff_id, actor_role_codes, action, entity_type, entity_id, reason, request_id, ip_hash, after, occurred_at
         from audit_event where action = 'admin.action_denied' order by id`,
    );
    return result.rows;
  }

  /** Creates an active staff user with a credential and a role, and returns its id. */
  async function createStaff(email: string, password: string, roleId: number, grantedBy: number): Promise<number> {
    const inserted = await fixture.pool.query<{ id: string }>(
      `insert into staff_user (email, display_name) values ($1, 'Test Staff') returning id`,
      [email],
    );
    const id = Number(inserted.rows[0]?.id);
    await fixture.pool.query(
      `insert into staff_credential (staff_user_id, kind, secret_hash, hash_algorithm)
       values ($1, 'password', $2, 'scrypt')`,
      [id, await hashPassword(password)],
    );
    await fixture.pool.query(`insert into staff_role (staff_user_id, role_id, granted_by) values ($1, $2, $3)`, [
      id,
      roleId,
      grantedBy,
    ]);
    return id;
  }

  before(async () => {
    fixture = await startMigratedDatabase();
    await seedReferenceData();

    const ownerRole = await fixture.pool.query<{ id: string }>(`select id from role where code = $1`, [OWNER_ROLE.code]);
    const ownerRoleId = Number(ownerRole.rows[0]?.id);

    ownerId = await createStaff('denial-owner@example.test', OWNER_PASSWORD, ownerRoleId, 1);
    await fixture.pool.query(`update staff_role set granted_by = $1 where staff_user_id = $1`, [ownerId]);

    // A role that can read staff but may not manage them: enough to reach the service, not enough to
    // be allowed to act. D10 is owner-only at launch, so this role exists only inside this test.
    const limitedRoleId = await withTransaction(async (tx) => {
      const inserted = await tx
        .insert(role)
        .values({ code: 'denial_limited', name: 'Denial limited', isOwnerLevel: false })
        .returning({ id: role.id });
      const roleId = inserted[0]?.id;
      if (roleId === undefined) throw new Error('limited role insert returned no id');
      await tx.insert(rolePermission).values(
        await tx
          .select({ roleId: sql<number>`${roleId}::bigint`, permissionId: permission.id })
          .from(permission)
          .where(sql`${permission.code} = ${PERMISSIONS.staffRead}`),
      );
      return roleId;
    });

    limitedId = await createStaff('denial-limited@example.test', LIMITED_PASSWORD, limitedRoleId, ownerId);
    victimId = await createStaff('denial-victim@example.test', OWNER_PASSWORD, limitedRoleId, ownerId);

    const permissions = await withTransaction((tx) => loadStaffPermissions(tx, limitedId));
    limitedActor = { staffUserId: limitedId, permissions, roleCodes: ['denial_limited'] };
  });

  beforeEach(() => {
    // The per-actor bound is process state. Resetting it keeps one test's burst from suppressing
    // another test's expected record.
    resetDenialLogLimits();
  });

  after(async () => {
    await fixture.close();
  });

  it('persists a refusal that the failed transaction rolls back (the confirmed defect)', async () => {
    const before = await denialRows();
    assert.equal(limitedActor.permissions.has(PERMISSIONS.staffManage), false);

    // The actor holds staff.read only. This is the shape of a privilege-escalation attempt: a real
    // session, a real endpoint, a capability it does not have. The target id is supplied by the
    // caller - exactly as a request body supplies it - and must never become the recorded actor.
    await assert.rejects(
      () => withTransaction((tx) => grantRole(tx, limitedActor, { targetStaffUserId: victimId, roleCode: OWNER_ROLE.code })),
      (error: unknown) => error instanceof AuthorizationError,
    );

    // The protected state is unchanged: the escalation did not happen.
    const granted = await fixture.pool.query(
      `select 1 from staff_role sr join role r on r.id = sr.role_id
        where sr.staff_user_id = $1 and r.code = $2`,
      [victimId, OWNER_ROLE.code],
    );
    assert.equal(granted.rowCount, 0, 'the denied escalation must not grant anything');

    // And the evidence survives the rollback - which it did not before this fix.
    const after = await denialRows();
    assert.equal(after.length, before.length + 1, 'the refusal must be recorded exactly once');

    const record = after[after.length - 1];
    assert.ok(record !== undefined);
    assert.equal(Number(record.actor_staff_id), limitedId, 'the actor is the session, not the request body');
    assert.notEqual(Number(record.actor_staff_id), victimId, 'the supplied target must never become the actor');
    assert.deepEqual(record.actor_role_codes, ['denial_limited']);
    assert.equal(record.after?.denied, `service.${PERMISSIONS.staffManage}`);
    assert.equal(record.after?.category, 'forbidden');
    assert.equal(record.entity_type, 'staff_user');
    assert.equal(Number(record.entity_id), victimId);
    assert.ok(record.occurred_at instanceof Date);
  });

  it('keeps a denial distinguishable from a successful business event', async () => {
    const denialCount = (await denialRows()).length;

    // A real, permitted action by a real owner: the same capability, successfully used.
    await withTransaction((tx) =>
      grantRole(tx, { staffUserId: ownerId, permissions: new Set([PERMISSIONS.staffManage]), roleCodes: [OWNER_ROLE.code] }, {
        targetStaffUserId: victimId,
        roleCode: OWNER_ROLE.code,
      }),
    );

    const business = await fixture.pool.query<{ action: string }>(
      `select action from audit_event where action = 'staff.role_granted'`,
    );
    assert.ok(business.rowCount !== null && business.rowCount > 0, 'the successful action is recorded');

    // A denial is never a business event: different action code, and the security rows are exactly
    // the ones the denial writer produced.
    const denials = await denialRows();
    assert.equal(denials.length, denialCount);
    assert.ok(denials.every((row) => row.action === 'admin.action_denied'));
    assert.ok(denials.every((row) => row.after?.category === 'forbidden' || row.after?.category === 'csrf'));

    // Undo, so this test leaves the fixture as it found it.
    await fixture.pool.query(`delete from staff_role where staff_user_id = $1 and role_id = (select id from role where code = $2)`, [
      victimId,
      OWNER_ROLE.code,
    ]);
  });

  it('refuses to store a denial that has no authenticated actor', async () => {
    const before = (await denialRows()).length;

    const written = await recordDeniedAction({
      actorStaffId: null,
      actorRoleCodes: [],
      action: 'mutation.staff.manage',
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: 'anonymous request',
    });

    assert.equal(written, false);
    assert.equal((await denialRows()).length, before, 'an anonymous denial must not be stored');
  });

  it('bounds repeated denials per actor without silencing a different actor', async () => {
    const before = (await denialRows()).length;

    let written = 0;
    for (let attempt = 0; attempt < DENIAL_LOG.maxAttemptsPerWindow * 3; attempt += 1) {
      const ok = await recordDeniedAction({
        actorStaffId: limitedId,
        actorRoleCodes: ['denial_limited'],
        action: 'mutation.staff.manage',
        entityType: 'admin_route',
        entityId: 0,
        category: 'forbidden',
        reason: 'burst',
      });
      if (ok) written += 1;
    }

    assert.equal(written, DENIAL_LOG.maxAttemptsPerWindow, 'the burst is capped at the configured bound');
    assert.equal((await denialRows()).length, before + DENIAL_LOG.maxAttemptsPerWindow);

    // The bound is per actor, so one actor's burst does not hide another actor's refusal.
    const otherWritten = await recordDeniedAction({
      actorStaffId: ownerId,
      actorRoleCodes: [OWNER_ROLE.code],
      action: 'mutation.staff.manage',
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: 'different actor',
    });
    assert.equal(otherWritten, true);
  });

  it('does not throw when a denial cannot be written, and does not change the refusal', async () => {
    const before = (await denialRows()).length;

    // An actor id that does not exist violates the audit trail's foreign key, so the insert fails the
    // same way a database outage would. The writer must absorb it: a refusal must not become a 500,
    // and must not become an allow.
    const written = await recordDeniedAction({
      actorStaffId: 999_999_999,
      actorRoleCodes: ['denial_limited'],
      action: 'mutation.staff.manage',
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: 'unwritable',
    });

    assert.equal(written, false);
    assert.equal((await denialRows()).length, before, 'a failed write leaves no partial row');
  });

  it('never records a password or a token in a denial record', async () => {
    await recordDeniedAction({
      actorStaffId: limitedId,
      actorRoleCodes: ['denial_limited'],
      action: 'mutation.staff.manage',
      entityType: 'admin_route',
      entityId: 0,
      category: 'forbidden',
      reason: 'secret-scan',
      requestId: 'req-abc-123',
      ipHash: 'ip-digest',
    });

    const serialised = JSON.stringify(await denialRows());
    assert.ok(!serialised.includes(LIMITED_PASSWORD), 'a password must never reach a denial record');
    assert.ok(!serialised.includes(OWNER_PASSWORD));
    assert.ok(!serialised.includes('secret_hash'));
    // The correlation id and the address digest are the only request-derived facts stored.
    assert.ok(serialised.includes('req-abc-123'));
    assert.ok(serialised.includes('ip-digest'));
  });
});
