#!/usr/bin/env tsx
/**
 * Delivery-charge seed CLI.
 *
 * The store's delivery charges are **owner-configured settings**, not code: they live in
 * `delivery_setting` and `delivery_district_charge`, and the owner can change every one of them at
 * **Settings -> Delivery charges** afterwards. This command exists so a fresh database starts from the
 * owner's stated amounts instead of from "unconfigured", which correctly refuses every checkout
 * (ADR 0016).
 *
 * The amounts below are the owner's decision (2026-10-23): Dhaka 100, Chattogram 60, other districts
 * 120 - all in whole taka. They are written as **strings** because a price only ever arrives as the
 * owner typed it: `parsePoisha` refuses a bare number, since a number has no unit and guessing wrong is
 * a 100x money error.
 *
 * **Idempotent and non-destructive.** If a default is already configured, the command reports it and
 * exits without writing: re-running it can never overwrite a figure the owner has since chosen. It
 * refuses a non-local target outright, prints host and database (never the connection string), and
 * requires an active owner account - the write is audited against that actor, exactly like a save from
 * the panel.
 */

import { sql } from 'drizzle-orm';

import { closeDb, withTransaction } from '../src/db/client';
import { role, staffRole, staffUser } from '../src/db/schema';
import { assertDisposableDatabase, serverEnv } from '../src/server/env';
import { loadStaffPermissions } from '../src/server/authz/roles';
import { loadDeliveryRates, setDefaultDeliveryCharge, setDistrictDeliveryCharge } from '../src/server/delivery/service';

/** The owner's stated charges, in whole taka, as the panel would receive them. */
const CHARGES = {
  default: '120',
  dhaka: '100',
  chattogram: '60',
} as const;

function describeTarget(): string {
  const env = serverEnv();
  const parsed = new URL(env.databaseUrl);
  return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname} (env=${env.environment})`;
}

async function main(): Promise<void> {
  const env = serverEnv();
  console.log(`target: ${describeTarget()}`);
  assertDisposableDatabase(env);

  const result = await withTransaction(async (tx) => {
    const owner = await tx
      .select({ id: staffUser.id, email: staffUser.email })
      .from(staffUser)
      .innerJoin(staffRole, sql`${staffRole.staffUserId} = ${staffUser.id}`)
      .innerJoin(role, sql`${role.id} = ${staffRole.roleId}`)
      .where(sql`${role.code} = 'owner' and ${staffUser.status} = 'active'`)
      .orderBy(staffUser.id)
      .limit(1);

    const actorRow = owner[0];
    if (actorRow === undefined) {
      return { ok: false as const, reason: 'no active owner account: run `npm run staff:bootstrap` first' };
    }

    const actor = {
      staffUserId: actorRow.id,
      permissions: await loadStaffPermissions(tx, actorRow.id),
      roleCodes: ['owner'],
    };

    const before = await loadDeliveryRates(tx);
    if (before.defaultMinor !== null) {
      return { ok: true as const, skipped: true as const, before, actorEmail: actorRow.email };
    }

    // The default first: an override is meaningless while the fallback is unconfigured.
    await setDefaultDeliveryCharge(tx, actor, CHARGES.default);
    await setDistrictDeliveryCharge(tx, actor, { districtCode: 'dhaka', amount: CHARGES.dhaka });
    await setDistrictDeliveryCharge(tx, actor, { districtCode: 'chattogram', amount: CHARGES.chattogram });

    return { ok: true as const, skipped: false as const, after: await loadDeliveryRates(tx), actorEmail: actorRow.email };
  });

  if (!result.ok) {
    console.error(`✗ ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  if (result.skipped) {
    console.log(
      `✓ already configured (default ${result.before.defaultMinor} poisha); nothing written. ` +
        'Change the amounts at Settings -> Delivery charges.',
    );
    return;
  }

  console.log(`✓ delivery charges seeded by ${result.actorEmail}`);
  console.log(`  default (other districts): ${result.after.defaultMinor} poisha`);
  for (const [districtCode, amountMinor] of result.after.overrides) {
    console.log(`  ${districtCode}: ${amountMinor} poisha`);
  }
  console.log('  the owner can change every figure at Settings -> Delivery charges');
}

main()
  .catch((error: unknown) => {
    console.error('✗ delivery seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
