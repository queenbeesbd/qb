import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { withTransaction } from '../../src/db/client';
import { seedOrder, SKIP_REASON, startMigratedDatabase, toolingAvailable, type DbFixture } from './helpers';
import { AuthorizationError, ConflictError, ValidationError } from '../../src/server/authz/authorize';
import { PERMISSIONS } from '../../src/server/authz/permissions';
import {
  availablePrepaidMethods,
  createRecipient,
  deactivateRecipient,
  reactivateRecipient,
  recipientConfiguration,
  updateRecipient,
} from '../../src/server/payments/recipients';

/** The owner context: full permissions, which is what the launch role set contains (D10). */
const OWNER = { staffUserId: 0, permissions: new Set<string>([PERMISSIONS.paymentRecipientManage]), roleCodes: ['owner'] };
/** A principal that can read orders but not configure where money is sent. */
const LIMITED = { staffUserId: 0, permissions: new Set<string>([PERMISSIONS.orderRead]), roleCodes: ['limited'] };

describe('payment-recipient configuration (Phase 16C)', { skip: toolingAvailable ? false : SKIP_REASON }, () => {
  let fixture: DbFixture;

  before(async () => {
    fixture = await startMigratedDatabase();
    const seeded = await seedOrder(fixture.pool, { withReservation: false });
    OWNER.staffUserId = seeded.staffId;
    LIMITED.staffUserId = seeded.staffId;
  });

  after(async () => {
    await fixture.close();
  });

  async function activeRow(method: string): Promise<{ id: number; accountNumber: string; accountLabel: string } | null> {
    const rows = await fixture.pool.query<{ id: string; account_number: string; account_label: string }>(
      `select id, account_number, account_label from payment_recipient where method = $1 and is_active`,
      [method],
    );
    const row = rows.rows[0];
    return row === undefined
      ? null
      : { id: Number(row.id), accountNumber: row.account_number, accountLabel: row.account_label };
  }

  async function auditActions(entityId: number): Promise<string[]> {
    const rows = await fixture.pool.query<{ action: string }>(
      `select action from audit_event where entity_type = 'payment_recipient' and entity_id = $1 order by id`,
      [entityId],
    );
    return rows.rows.map((row) => row.action);
  }

  it('refuses a principal without the permission, and records the attempt', async () => {
    await assert.rejects(
      withTransaction((tx) => recipientConfiguration(tx, LIMITED)),
      AuthorizationError,
    );
    await assert.rejects(
      withTransaction((tx) =>
        createRecipient(tx, LIMITED, { method: 'nagad', accountNumber: '01799999999', accountLabel: 'Sneaky' }),
      ),
      AuthorizationError,
    );
    const created = await activeRow('nagad');
    assert.equal(created, null, 'no recipient is created by a refused request');

    const denials = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from audit_event where action = 'admin.action_denied' and actor_staff_id = $1`,
      [LIMITED.staffUserId],
    );
    assert.ok(Number(denials.rows[0]?.total ?? '0') > 0, 'the refusal is recorded in its own transaction');
  });

  it('creates a recipient, stores the normalised number and audits it', async () => {
    const result = await withTransaction((tx) =>
      createRecipient(tx, OWNER, {
        method: 'nagad',
        accountNumber: '+880 1712-345678',
        accountLabel: '  Nagad   — QueenBee\'s  ',
      }),
    );
    const row = await activeRow('nagad');
    assert.equal(row?.id, result.recipientId);
    assert.equal(row?.accountNumber, '01712345678');
    assert.equal(row?.accountLabel, "Nagad — QueenBee's");
    assert.deepEqual(await auditActions(result.recipientId), ['payment.recipient_created']);

    const methods = await withTransaction((tx) => availablePrepaidMethods(tx));
    assert.ok(methods.includes('nagad'), 'the checkout read sees the new method');
  });

  it('refuses a second active recipient for the same method', async () => {
    await assert.rejects(
      withTransaction((tx) =>
        createRecipient(tx, OWNER, { method: 'nagad', accountNumber: '01798887777', accountLabel: 'Second' }),
      ),
      ConflictError,
    );
    assert.equal((await activeRow('nagad'))?.accountNumber, '01712345678', 'the original is untouched');
  });

  it('refuses COD and malformed details before writing anything', async () => {
    for (const input of [
      { method: 'cod', accountNumber: '01712345678', accountLabel: 'Cash' },
      { method: 'nagad', accountNumber: '0171234567', accountLabel: 'Short' },
      { method: 'nagad', accountNumber: '01712345678', accountLabel: '' },
      { method: 'rocket', accountNumber: '01712345678', accountLabel: 'Other' },
    ]) {
      await assert.rejects(withTransaction((tx) => createRecipient(tx, OWNER, input)), ValidationError);
    }
    const count = await fixture.pool.query<{ total: string }>(
      `select count(*)::text as total from payment_recipient where method = 'cod'`,
    );
    assert.equal(count.rows[0]?.total, '0');
  });

  it('edits in place while no claim references the row', async () => {
    const before = await activeRow('nagad');
    assert.ok(before !== null);

    const result = await withTransaction((tx) =>
      updateRecipient(tx, OWNER, {
        recipientId: before.id,
        accountNumber: '01712345679',
        accountLabel: 'Nagad — QueenBee\'s (business)',
      }),
    );
    assert.equal(result.outcome, 'updated');
    assert.equal(result.recipientId, before.id, 'the same row is edited');

    const after = await activeRow('nagad');
    assert.equal(after?.accountNumber, '01712345679');
    assert.deepEqual(await auditActions(before.id), [
      'payment.recipient_created',
      'payment.recipient_updated',
    ]);
  });

  it('reports an unchanged edit without writing or auditing', async () => {
    const row = await activeRow('nagad');
    assert.ok(row !== null);
    const result = await withTransaction((tx) =>
      updateRecipient(tx, OWNER, {
        recipientId: row.id,
        accountNumber: row.accountNumber,
        accountLabel: row.accountLabel,
      }),
    );
    assert.equal(result.outcome, 'unchanged');
    assert.deepEqual(await auditActions(row.id), ['payment.recipient_created', 'payment.recipient_updated']);
  });

  it('deactivates without deleting, and the checkout read follows', async () => {
    const row = await activeRow('nagad');
    assert.ok(row !== null);
    await withTransaction((tx) => deactivateRecipient(tx, OWNER, { recipientId: row.id }));

    assert.equal(await activeRow('nagad'), null);
    const methods = await withTransaction((tx) => availablePrepaidMethods(tx));
    assert.ok(!methods.includes('nagad'), 'a deactivated recipient is not offered at checkout');

    const stored = await fixture.pool.query<{ is_active: boolean; deactivated_at: Date | null }>(
      `select is_active, deactivated_at from payment_recipient where id = $1`,
      [row.id],
    );
    assert.equal(stored.rows[0]?.is_active, false);
    assert.notEqual(stored.rows[0]?.deactivated_at, null);
    assert.ok((await auditActions(row.id)).includes('payment.recipient_deactivated'));

    await assert.rejects(
      withTransaction((tx) => deactivateRecipient(tx, OWNER, { recipientId: row.id })),
      ConflictError,
      'a second deactivation is a conflict, not a second write',
    );
  });

  it('reactivates the same row, and refuses while another is active', async () => {
    const rows = await fixture.pool.query<{ id: string }>(
      `select id from payment_recipient where method = 'nagad' order by id limit 1`,
    );
    const recipientId = Number(rows.rows[0]?.id);
    await withTransaction((tx) => reactivateRecipient(tx, OWNER, { recipientId }));
    assert.equal((await activeRow('nagad'))?.id, recipientId);
    assert.ok((await auditActions(recipientId)).includes('payment.recipient_reactivated'));

    await assert.rejects(
      withTransaction((tx) => reactivateRecipient(tx, OWNER, { recipientId })),
      ConflictError,
      'already active',
    );
  });

  it('preserves a submitted claim when the recipient it references is edited', async () => {
    // A prepaid order and its claim, exactly as checkout writes them: the claim references the active
    // recipient row that the order transaction resolved.
    const seeded = await seedOrder(fixture.pool, { withReservation: false });
    const active = await activeRow('bkash');
    assert.ok(active !== null);
    assert.equal(active.id, seeded.recipientId, 'the seed uses the active bkash recipient');
    const claim = await fixture.pool.query<{ id: string }>(
      `insert into payment_claim
         (order_id, payment_recipient_id, sender_msisdn, transaction_reference, claimed_amount_minor,
          state, submitted_by_customer_id)
       values ($1, $2, '01712345678', 'BKASHREF0001', 10100, 'submitted', $3) returning id`,
      [seeded.orderId, active.id, seeded.customerId],
    );
    const claimId = Number(claim.rows[0]?.id);

    const result = await withTransaction((tx) =>
      updateRecipient(tx, OWNER, {
        recipientId: active.id,
        accountNumber: '01700001111',
        accountLabel: 'bKash — new account',
      }),
    );
    assert.equal(result.outcome, 'replaced');
    assert.notEqual(result.recipientId, active.id, 'a successor row is created');

    // The old row keeps the number the claim actually referenced.
    const old = await fixture.pool.query<{ is_active: boolean; account_number: string }>(
      `select is_active, account_number from payment_recipient where id = $1`,
      [active.id],
    );
    assert.equal(old.rows[0]?.is_active, false);
    assert.equal(old.rows[0]?.account_number, active.accountNumber);

    // The claim is untouched and still points at that row.
    const storedClaim = await fixture.pool.query<{ payment_recipient_id: string; state: string; transaction_reference: string }>(
      `select payment_recipient_id, state, transaction_reference from payment_claim where id = $1`,
      [claimId],
    );
    assert.equal(Number(storedClaim.rows[0]?.payment_recipient_id), active.id);
    assert.equal(storedClaim.rows[0]?.state, 'submitted');
    assert.equal(storedClaim.rows[0]?.transaction_reference, 'BKASHREF0001');

    // Only one active row remains, and it is the successor.
    const active2 = await activeRow('bkash');
    assert.equal(active2?.id, result.recipientId);
    assert.equal(active2?.accountNumber, '01700001111');

    assert.deepEqual(await auditActions(result.recipientId), ['payment.recipient_created']);
    assert.ok((await auditActions(active.id)).includes('payment.recipient_deactivated'));
  });

  it('refuses to edit a deactivated recipient', async () => {
    const rows = await fixture.pool.query<{ id: string }>(
      `select id from payment_recipient where method = 'bkash' and not is_active order by id limit 1`,
    );
    const recipientId = Number(rows.rows[0]?.id);
    await assert.rejects(
      withTransaction((tx) =>
        updateRecipient(tx, OWNER, {
          recipientId,
          accountNumber: '01700002222',
          accountLabel: 'Reactivated first',
        }),
      ),
      ConflictError,
    );
  });

  it('reports the configuration the screen renders, and refuses a second active row during reactivation', async () => {
    const configuration = await withTransaction((tx) => recipientConfiguration(tx, OWNER));
    assert.ok(configuration.rows.length >= 3, 'history is kept, not deleted');
    assert.ok(configuration.availableMethods.includes('bkash'));
    assert.ok(configuration.availableMethods.includes('nagad'));
    assert.ok(configuration.rows.some((row) => row.claimCount > 0), 'the screen can say which rows claims reference');

    const inactive = configuration.rows.find((row) => row.method === 'bkash' && !row.isActive);
    assert.ok(inactive !== undefined);
    await assert.rejects(
      withTransaction((tx) => reactivateRecipient(tx, OWNER, { recipientId: inactive.id })),
      ConflictError,
      'reactivating an old row while its successor is active would create two active recipients',
    );
  });
});
