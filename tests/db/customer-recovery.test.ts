import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  accountRecoveryToken,
  auditEvent,
  customer,
  customerCredential,
  customerSession,
} from '../../src/db/schema';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import { AuthorizationError } from '../../src/server/authz/authorize';
import { hashPassword } from '../../src/server/auth/password';
import type { SessionContext } from '../../src/server/auth/session';
import { sha256Hex } from '../../src/server/auth/tokens';
import {
  createCustomerSession,
  resolveCustomerSession,
} from '../../src/server/customer-auth/session';
import {
  issueCustomerRecovery,
  redeemCustomerRecovery,
} from '../../src/server/customer-auth/recovery';
import { RECOVERY_TOKEN_MS } from '../../src/server/customer-auth/constants';
import { SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';

/**
 * Owner-operated customer credential recovery (Phase 23, ADR 0012).
 *
 * Every property asserted here is a **database** property, so a stub would prove nothing: a credential
 * is unrecoverable because only a digest is stored, it is single-use because a guarded update says so,
 * superseding works because a partial unique index forbids two live rows, and a session is dead because
 * its row is revoked.
 */

let sourceCounter = 0;
function context(): SessionContext {
  sourceCounter += 1;
  return { ipHash: `recovery-ip-${sourceCounter}`, userAgentHash: 'test-agent' };
}

const csrf = (raw: string): string => `csrf:${raw}`;

const owner = (permissions: readonly string[] = [PERMISSIONS.customerCredentialReset]) => ({
  staffUserId: 1,
  permissions: new Set(permissions),
  roleCodes: ['owner'],
});

describe(
  'owner-operated customer credential recovery',
  { skip: toolingAvailable ? false : SKIP_REASON },
  () => {
    let fixture: DbFixture;
    let staffId: number;
    let emailCounter = 0;

    /** A fresh active customer with a known password, so tests never share an account. */
    async function newCustomer(status = 'active'): Promise<{ customerId: number; email: string }> {
      emailCounter += 1;
      const email = `recover-${emailCounter}@example.test`;
      const inserted = await fixture.pool.query<{ id: string }>(
        `insert into customer (email, display_name, status) values ($1, 'Recover Test', $2) returning id`,
        [email, status],
      );
      const customerId = Number(inserted.rows[0]?.id);
      await fixture.pool.query(
        `insert into customer_credential (customer_id, kind, secret_hash, hash_algorithm)
         values ($1, 'password', $2, 'scrypt')`,
        [customerId, await hashPassword('the-original-password')],
      );
      return { customerId, email };
    }

    async function issue(customerId: number, reason = 'verified by phone against the last order') {
      return fixture.db.transaction((tx) => issueCustomerRecovery(tx, owner(), { customerId, reason }));
    }

    async function redeem(rawToken: string, password: string, ctx = context()) {
      return fixture.db.transaction((tx) =>
        redeemCustomerRecovery(tx, {
          rawToken,
          password,
          context: ctx,
          createSession: async (customerId) => {
            const session = await createCustomerSession(tx, customerId, ctx);
            return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
          },
        }),
      );
    }

    /** A live session for a customer, so revocation has something real to revoke. */
    async function liveSession(customerId: number): Promise<string> {
      return fixture.db.transaction(async (tx) => {
        const session = await createCustomerSession(tx, customerId, context());
        return session.token;
      });
    }

    before(async () => {
      fixture = await startMigratedDatabase();
      const inserted = await fixture.pool.query<{ id: string }>(
        `insert into staff_user (email, display_name) values ('recovery-actor@example.test', 'Recovery Actor') returning id`,
      );
      staffId = Number(inserted.rows[0]?.id);
    });

    after(async () => {
      await fixture.close();
    });

    it('requires the permission in the service, not only in the route', async () => {
      const { customerId } = await newCustomer();

      await assert.rejects(
        () =>
          fixture.db.transaction((tx) =>
            issueCustomerRecovery(tx, owner([]), { customerId, reason: 'no permission at all' }),
          ),
        AuthorizationError,
      );

      const tokens = await fixture.db
        .select({ id: accountRecoveryToken.id })
        .from(accountRecoveryToken)
        .where(eq(accountRecoveryToken.customerId, customerId));
      assert.equal(tokens.length, 0, 'a refused caller must not mint a credential');

      // The refusal is recorded durably, in its own transaction, so the rollback cannot erase it.
      const denials = await fixture.db
        .select({ action: auditEvent.action })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.action, 'admin.action_denied'),
            eq(auditEvent.entityId, customerId),
          ),
        );
      assert.ok(denials.length >= 1, 'the refusal must survive the rolled-back transaction');
    });

    it('stores only a digest and records the actor and the reason', async () => {
      const { customerId } = await newCustomer();
      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);

      const rows = await fixture.db
        .select({
          tokenHash: accountRecoveryToken.tokenHash,
          purpose: accountRecoveryToken.purpose,
          expiresAt: accountRecoveryToken.expiresAt,
        })
        .from(accountRecoveryToken)
        .where(eq(accountRecoveryToken.customerId, customerId));

      assert.equal(rows.length, 1);
      // The plaintext appears in no column, and the digest is the only lookup path.
      assert.equal(rows[0]?.tokenHash, sha256Hex(issued.token));
      assert.notEqual(rows[0]?.tokenHash, issued.token);
      assert.equal(rows[0]?.purpose, 'password_reset');
      assert.ok((rows[0]?.expiresAt.getTime() ?? 0) > Date.now());

      const audit = await fixture.db
        .select({
          actorStaffId: auditEvent.actorStaffId,
          reason: auditEvent.reason,
          after: auditEvent.after,
        })
        .from(auditEvent)
        .where(eq(auditEvent.action, 'customer.credential_reset_issued'));

      const row = audit.at(-1);
      assert.equal(row?.actorStaffId, staffId);
      assert.match(String(row?.reason), /verified by phone/);
      // Neither the credential nor its digest is written to the trail.
      const serialized = JSON.stringify(row);
      assert.equal(serialized.includes(issued.token), false);
      assert.equal(serialized.includes(sha256Hex(issued.token)), false);
    });

    it('expires a credential after 30 minutes, and refuses it afterwards', async () => {
      const { customerId } = await newCustomer();
      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      const lifetime = issued.expiresAt.getTime() - Date.now();
      assert.ok(
        lifetime > RECOVERY_TOKEN_MS - 5_000 && lifetime <= RECOVERY_TOKEN_MS,
        'the documented 30-minute lifetime is the one applied',
      );

      // Move the expiry into the past rather than waiting: the rule under test is the comparison.
      await fixture.pool.query(
        `update account_recovery_token set expires_at = now() - interval '1 second' where customer_id = $1`,
        [customerId],
      );

      const redeemed = await redeem(issued.token, 'a-brand-new-password-1');
      assert.deepEqual(redeemed.ok, false);
      if (!redeemed.ok) assert.equal(redeemed.failure, 'invalid_token');
    });

    it('is single-use: the same credential cannot be redeemed twice', async () => {
      const { customerId } = await newCustomer();
      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      const first = await redeem(issued.token, 'a-brand-new-password-1');
      assert.equal(first.ok, true);

      const second = await redeem(issued.token, 'another-brand-new-password');
      assert.deepEqual(second.ok, false);
      if (!second.ok) assert.equal(second.failure, 'invalid_token');

      const used = await fixture.db
        .select({ usedAt: accountRecoveryToken.usedAt })
        .from(accountRecoveryToken)
        .where(eq(accountRecoveryToken.customerId, customerId));
      assert.equal(used.length, 1);
      assert.notEqual(used[0]?.usedAt, null);
    });

    it('rejects a superseded credential when a new one is issued', async () => {
      const { customerId } = await newCustomer();
      const first = await issue(customerId);
      const second = await issue(customerId);
      assert.equal(first.ok && second.ok, true);
      if (!first.ok || !second.ok) return;

      const old = await redeem(first.token, 'a-brand-new-password-1');
      assert.deepEqual(old.ok, false);

      // Exactly one live row survives, which is what the partial unique index enforces.
      const live = await fixture.db
        .select({ id: accountRecoveryToken.id })
        .from(accountRecoveryToken)
        .where(
          and(
            eq(accountRecoveryToken.customerId, customerId),
            isNull(accountRecoveryToken.usedAt),
          ),
        );
      assert.equal(live.length, 1);

      const fresh = await redeem(second.token, 'a-brand-new-password-2');
      assert.equal(fresh.ok, true);
    });

    it('revokes every live session at issuance', async () => {
      const { customerId } = await newCustomer();
      const first = await liveSession(customerId);
      const second = await liveSession(customerId);

      assert.notEqual(
        await fixture.db.transaction((tx) => resolveCustomerSession(tx, first, csrf)),
        null,
      );

      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;
      assert.equal(issued.sessionsRevoked, 2);

      assert.equal(
        await fixture.db.transaction((tx) => resolveCustomerSession(tx, first, csrf)),
        null,
      );
      assert.equal(
        await fixture.db.transaction((tx) => resolveCustomerSession(tx, second, csrf)),
        null,
      );

      const reasons = await fixture.db
        .select({ reason: customerSession.revokedReason })
        .from(customerSession)
        .where(eq(customerSession.customerId, customerId));
      assert.ok(reasons.every((row) => row.reason === 'admin_revoke'));
    });

    it('refuses a suspended account without revealing why', async () => {
      const suspended = await newCustomer('suspended');

      const forSuspended = await issue(suspended.customerId);
      // An id that names no account produces the *same* outcome, so the pair is indistinguishable.
      const forMissing = await issue(987_654_321);
      assert.deepEqual(forSuspended, { ok: false, failure: 'unavailable' });
      assert.deepEqual(forMissing, { ok: false, failure: 'unavailable' });

      const tokens = await fixture.db
        .select({ id: accountRecoveryToken.id })
        .from(accountRecoveryToken)
        .where(eq(accountRecoveryToken.customerId, suspended.customerId));
      assert.equal(tokens.length, 0, 'a suspended account is never issued a credential');

      // The refusal is audited, and the trail does not name the suspension as the reason.
      const refusals = await fixture.db
        .select({ reason: auditEvent.reason })
        .from(auditEvent)
        .where(eq(auditEvent.action, 'customer.recovery_refused'));
      assert.ok(refusals.length >= 1);
      for (const row of refusals) {
        assert.equal(/suspend/i.test(String(row.reason)), false);
      }
    });

    it('requires a reason, and refuses a weak new password without burning the credential', async () => {
      const { customerId } = await newCustomer();

      const noReason = await issue(customerId, 'short');
      assert.deepEqual(noReason, { ok: false, failure: 'invalid_reason' });

      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      const weak = await redeem(issued.token, 'short');
      assert.deepEqual(weak.ok, false);
      if (!weak.ok) assert.equal(weak.failure, 'weak_password');

      // The credential is still usable: a mistyped password is not a reason to call the owner again.
      const good = await redeem(issued.token, 'a-brand-new-password-1');
      assert.equal(good.ok, true);
    });

    it('forces the new password, retiring the old one and revoking every session', async () => {
      const { customerId } = await newCustomer();
      const staleSession = await liveSession(customerId);

      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      const redeemed = await redeem(issued.token, 'a-brand-new-password-1');
      assert.equal(redeemed.ok, true);
      if (!redeemed.ok) return;

      // Exactly one live password credential, and it verifies the new password only.
      const credentials = await fixture.db
        .select({ secretHash: customerCredential.secretHash })
        .from(customerCredential)
        .where(
          and(
            eq(customerCredential.customerId, customerId),
            eq(customerCredential.kind, 'password'),
            isNull(customerCredential.revokedAt),
          ),
        );
      assert.equal(credentials.length, 1);
      assert.match(String(credentials[0]?.secretHash), /^scrypt\$/);
      assert.notEqual(credentials[0]?.secretHash, 'a-brand-new-password-1');

      // The old session never survives the reset.
      assert.equal(
        await fixture.db.transaction((tx) => resolveCustomerSession(tx, staleSession, csrf)),
        null,
      );

      // The session handed back is the new one, and it resolves.
      assert.notEqual(
        await fixture.db.transaction((tx) =>
          resolveCustomerSession(tx, redeemed.rawToken, csrf),
        ),
        null,
      );

      const audit = await fixture.db
        .select({ actorType: auditEvent.actorType })
        .from(auditEvent)
        .where(eq(auditEvent.action, 'customer.credential_reset_redeemed'));
      assert.equal(audit.at(-1)?.actorType, 'system', 'a customer is never an audit actor (D23)');
    });

    it('refuses malformed credentials before any lookup', async () => {
      for (const bad of ['', 'nope', 'a'.repeat(42), 'a'.repeat(44), '../etc/passwd']) {
        const result = await redeem(bad, 'a-brand-new-password-1');
        assert.deepEqual(result.ok, false, `${JSON.stringify(bad)} must be refused`);
      }
    });

    it('lets exactly one of two concurrent redemptions win', async () => {
      const { customerId } = await newCustomer();
      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      // Two separate transactions on two separate connections, started together.
      const attempt = (password: string) =>
        fixture.db.transaction((tx) =>
          redeemCustomerRecovery(tx, {
            rawToken: issued.token,
            password,
            context: context(),
            createSession: async (id) => {
              const session = await createCustomerSession(tx, id, context());
              return { token: session.token, absoluteExpiresAt: session.absoluteExpiresAt };
            },
          }),
        );

      const results = await Promise.allSettled([
        attempt('concurrent-password-one'),
        attempt('concurrent-password-two'),
      ]);

      const successes = results.filter(
        (result) => result.status === 'fulfilled' && result.value.ok,
      );
      assert.equal(successes.length, 1, 'exactly one redemption may succeed');

      const live = await fixture.db
        .select({ total: sql<number>`count(*)::int` })
        .from(customerCredential)
        .where(
          and(
            eq(customerCredential.customerId, customerId),
            eq(customerCredential.kind, 'password'),
            isNull(customerCredential.revokedAt),
          ),
        );
      assert.equal(live[0]?.total, 1, 'one live credential, not two');
    });

    it('throttles repeated failures by source and records them durably', async () => {
      const sharedContext = context();
      let blocked = false;

      // 11 attempts against garbage credentials from one source; the policy ceiling is 10.
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const result = await fixture.db.transaction((tx) =>
          redeemCustomerRecovery(tx, {
            rawToken: 'A'.repeat(43),
            password: 'a-brand-new-password-1',
            context: sharedContext,
            createSession: async () => ({ token: 'x', absoluteExpiresAt: new Date() }),
          }),
        );
        if (!result.ok && result.failure === 'throttled') blocked = true;
      }
      assert.equal(blocked, true, 'a burst of failures must be throttled');

      // A valid credential from that source is refused while the block holds: the throttle is the gate.
      const { customerId } = await newCustomer();
      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      const whileBlocked = await redeem(issued.token, 'a-brand-new-password-1', sharedContext);
      assert.deepEqual(whileBlocked.ok, false);
      if (!whileBlocked.ok) assert.equal(whileBlocked.failure, 'throttled');

      // From a fresh source the same credential works, so the block was on the source and not the token.
      const unblocked = await redeem(issued.token, 'a-brand-new-password-1');
      assert.equal(unblocked.ok, true);
    });

    it('leaves the account owned by no one if the customer is deleted, not resurrected', async () => {
      const { customerId } = await newCustomer();
      const issued = await issue(customerId);
      assert.equal(issued.ok, true);
      if (!issued.ok) return;

      // A soft-deleted customer is refused exactly like a suspended one. The schema's
      // `customer_deleted_implies_status` check requires the status to move with the timestamp.
      await fixture.db
        .update(customer)
        .set({ deletedAt: new Date(), status: 'deleted' })
        .where(eq(customer.id, customerId));

      const redeemed = await redeem(issued.token, 'a-brand-new-password-1');
      assert.deepEqual(redeemed.ok, false);
    });
  },
);
