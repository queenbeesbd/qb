import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PgTable } from 'drizzle-orm/pg-core';
import { getTableName } from 'drizzle-orm';

import * as schema from '../../src/db/schema';
import { hashMigration, readJournal } from '../../src/db/migrate';
import { parseDeclaredObjects } from '../../src/db/validate';

const FOLDER = 'drizzle';

function schemaTableNames(): string[] {
  return Object.values(schema)
    .filter((value) => value instanceof PgTable)
    .map((table) => getTableName(table))
    .sort();
}

describe('schema and migration integrity', () => {
  it('declares exactly the 48 approved tables', () => {
    // 42 through Phase 21; Phase 22 added `order_additional_cost` (ADR 0018); Phase 39 added
    // `telegram_recipient` (ADR 0022); the homepage hero carousel added `hero_image`; the site-open
    // offer popup added `offer_popup` (2026-11-06). Every addition is additive and has its own migration.
    const names = schemaTableNames();
    assert.equal(names.length, 48, `expected 48 tables, found ${names.length}: ${names.join(', ')}`);
  });

  it('generated SQL matches the TypeScript schema exactly (no unregenerated drift)', () => {
    const fromSql = parseDeclaredObjects(FOLDER).tables.slice().sort();
    const fromSchema = schemaTableNames();
    assert.deepEqual(
      fromSql,
      fromSchema,
      'the migration files and src/db/schema disagree - run: npm run db:generate',
    );
  });

  it('every journal entry has a matching SQL file', () => {
    const files = new Set(readdirSync(FOLDER).filter((file) => file.endsWith('.sql')));
    for (const entry of readJournal(FOLDER)) {
      assert.ok(files.has(`${entry.tag}.sql`), `journal entry ${entry.tag} has no SQL file`);
    }
  });

  it('hashes each migration without error, so status reporting can run', () => {
    for (const entry of readJournal(FOLDER)) {
      assert.match(hashMigration(entry, FOLDER), /^[0-9a-f]{64}$/);
    }
  });

  it('preserves the invariants that carry the approved business rules', () => {
    const sql = readdirSync(FOLDER)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => readFileSync(join(FOLDER, file), 'utf8'))
      .join('\n');

    const required: [string, RegExp][] = [
      // D11: no oversell, enforced by the database.
      ['oversell backstop', /CHECK \("inventory_balance"\."reserved" <= "inventory_balance"\."on_hand"\)/],
      // D11: at most one active submitted claim per unit.
      ['one active submitted claim', /CREATE UNIQUE INDEX "payment_claim_active_unique"[^;]*WHERE[^;]*'submitted'/],
      // D9: the approved 24-hour expiry duration, encoded rather than assumed.
      ['24-hour expiry duration', /"order"\."expires_at" = "order"\."placed_at" \+ interval '24 hours'/],
      // D9: a refund cannot be marked complete without confirmed evidence.
      ['refund completion needs evidence', /CONSTRAINT "refund_completed_requires_evidence"/],
      // D9: rejection and false-claim findings need an actor and a reason.
      ['claim decision needs actor and reason', /CONSTRAINT "payment_claim_adverse_decision_needs_actor_and_reason"/],
      // D9: stock is restored only after physical receipt and inspection.
      ['restock requires accepted inspection', /CONSTRAINT "customer_return_restock_requires_acceptance"/],
      // D9: COD state exists only for COD orders.
      ['cod state only for cod', /CONSTRAINT "order_cod_state_only_for_cod"/],
      // ADR 0006: an image cannot be marked cleared without a recorded basis.
      ['image rights need a basis', /CONSTRAINT "product_image_cleared_needs_note"/],
      // ADR 0006, the discovery surfaces: a category photograph and a brand logo are asset keys, never
      // a URL or a hotlink. The column shape makes a provider URL a database error, not a review note.
      ['category image is an asset key', /CONSTRAINT "category_image_key_format"/],
      ['brand logo is an asset key', /CONSTRAINT "brand_logo_key_format"/],
      // Phase 19: one default row and one row per district; amounts are non-negative integers.
      ['delivery default singleton', /CONSTRAINT "delivery_setting_singleton"/],
      ['one delivery override per district', /CREATE UNIQUE INDEX "delivery_district_charge_district_unique"/],
      // Append-only history.
      ['append-only ledger', /CREATE TRIGGER inventory_movement_append_only/],
      ['append-only order events', /CREATE TRIGGER order_event_append_only/],
      ['append-only audit', /CREATE TRIGGER audit_event_append_only/],
      // Frozen order identity and charged amount.
      ['order immutable columns', /CREATE TRIGGER order_immutable_columns/],
      // Forbidden state transitions cannot be expressed as a CHECK; the guard is a trigger.
      ['reservation transition guard', /CREATE TRIGGER stock_reservation_transition_guard/],
      ['claim transition guard', /CREATE TRIGGER payment_claim_transition_guard/],
      // D10 is undecided, so the privilege rule is enforced by the database instead of a code list.
      ['privileged permission guard', /CREATE TRIGGER role_permission_privileged_guard/],
      // Phase 12: staff credential setup is owner-issued, so an anonymous issuance must be impossible.
      ['staff recovery issuance needs an issuer', /"issued_by_staff_id" bigint NOT NULL/],
      ['one live staff recovery token per purpose', /CREATE UNIQUE INDEX "staff_recovery_token_live_unique"[^;]*WHERE[^;]*"used_at" is null/],
    ];

    for (const [label, pattern] of required) {
      assert.match(sql, pattern, `missing invariant: ${label}`);
    }
  });

  it('keeps refunds structurally unable to restore stock', () => {
    // The absence of a link is the guarantee, so assert the absence rather than a rule.
    const sql = readFileSync(join(FOLDER, '0000_baseline_schema.sql'), 'utf8');
    const refundBlock = sql.slice(sql.indexOf('CREATE TABLE "refund"'));
    const body = refundBlock.slice(0, refundBlock.indexOf(');'));
    for (const forbidden of ['inventory_movement', 'stock_reservation', 'inventory_balance']) {
      assert.ok(
        !body.includes(forbidden),
        `refund must not reference ${forbidden}: a refund cannot be a stock fact`,
      );
    }
  });

  it('does not define COD states inside the payment enum', () => {
    const sql = readFileSync(join(FOLDER, '0000_baseline_schema.sql'), 'utf8');
    const paymentStateCheck = /CONSTRAINT "order_payment_state_valid" CHECK \(([^)]*)\)/.exec(sql);
    assert.ok(paymentStateCheck, 'payment state constraint missing');
    const values = paymentStateCheck[1];
    assert.ok(values !== undefined, 'payment state constraint has no value list');
    assert.ok(
      !values.includes('cod_'),
      'COD states must live in cod_state, not in payment_state',
    );
  });
});
