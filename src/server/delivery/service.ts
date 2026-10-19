/**
 * Delivery pricing and configuration (Phase 19).
 *
 * One resolver is used by checkout, order creation and the admin preview, so the number a customer
 * sees and the number stored on the order come from the same rule:
 *
 *   active district override -> configured default -> **refuse**
 *
 * The last step is deliberate. An unconfigured default must not become "free delivery" by accident;
 * it blocks the order with an actionable notice instead (ADR 0016).
 *
 * Every read and write here is server-side. No request may supply a delivery amount, and an override is
 * keyed by a **stable district code** from `src/lib/districts.ts`, never by a customer-typed name.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { deliveryDistrictCharge, deliverySetting } from '@/db/schema';
import { deliveryAreaByCode } from '@/lib/delivery-areas';
import type { DeliveryQuote, DeliveryQuoteResult, DeliveryRates } from '@/lib/delivery';
import { MAX_PRICE_MINOR, parsePoisha } from '@/server/catalog/validation';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

export type { DeliveryQuote, DeliveryQuoteResult, DeliveryRates };
export { quoteDelivery } from '@/lib/delivery';

/** Reads the current configuration. Absent configuration is represented as `null`, never as zero. */
export async function loadDeliveryRates(tx: Transaction): Promise<DeliveryRates> {
  const settingRows = await tx
    .select({ defaultMinor: deliverySetting.defaultMinor })
    .from(deliverySetting)
    .where(sql`${deliverySetting.id} = 1`);

  const overrideRows = await tx
    .select({ districtCode: deliveryDistrictCharge.districtCode, amountMinor: deliveryDistrictCharge.amountMinor })
    .from(deliveryDistrictCharge)
    .where(sql`${deliveryDistrictCharge.isActive}`);

  return {
    defaultMinor: settingRows[0]?.defaultMinor ?? null,
    overrides: new Map(overrideRows.map((row) => [row.districtCode, row.amountMinor])),
  };
}

export type DeliveryOverrideRow = {
  readonly id: number;
  readonly districtCode: string;
  readonly amountMinor: number;
  readonly isActive: boolean;
  readonly updatedAt: Date;
};

export async function loadDeliveryOverview(
  tx: Transaction,
): Promise<{ defaultMinor: number | null; overrides: readonly DeliveryOverrideRow[] }> {
  const settingRows = await tx
    .select({ defaultMinor: deliverySetting.defaultMinor })
    .from(deliverySetting)
    .where(sql`${deliverySetting.id} = 1`);

  const overrides = await tx
    .select({
      id: deliveryDistrictCharge.id,
      districtCode: deliveryDistrictCharge.districtCode,
      amountMinor: deliveryDistrictCharge.amountMinor,
      isActive: deliveryDistrictCharge.isActive,
      updatedAt: deliveryDistrictCharge.updatedAt,
    })
    .from(deliveryDistrictCharge)
    .orderBy(deliveryDistrictCharge.districtCode);

  return { defaultMinor: settingRows[0]?.defaultMinor ?? null, overrides };
}

/** Parses an owner-typed taka amount. Zero is valid (free delivery); negative and malformed are not. */
export function parseDeliveryAmount(value: unknown): number | null {
  return parsePoisha(value, { allowZero: true });
}

/** Only Dhaka and Chattogram carry an override; every other district is priced by the default. */
function requireOverrideArea(value: unknown): string {
  const area = typeof value === 'string' ? deliveryAreaByCode(value) : null;
  if (area === null || area.usesDefault) throw new ValidationError('that delivery area is not recognised');
  return area.code;
}

/**
 * Saves the required default charge.
 *
 * The write and its audit record share the caller's transaction, so the trail cannot describe a change
 * that did not commit. The before-value makes "was it configured?" answerable later.
 */
export async function setDefaultDeliveryCharge(
  tx: Transaction,
  actor: ActorContext,
  rawAmount: unknown,
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'delivery_setting', 1);

  const amountMinor = parseDeliveryAmount(rawAmount);
  if (amountMinor === null) throw new ValidationError('delivery charge must be a valid BDT amount');

  const existing = await tx
    .select({ defaultMinor: deliverySetting.defaultMinor })
    .from(deliverySetting)
    .where(sql`${deliverySetting.id} = 1`);
  const before = existing[0]?.defaultMinor ?? null;

  if (existing.length === 0) {
    await tx.insert(deliverySetting).values({
      id: 1,
      defaultMinor: amountMinor,
      updatedByStaffId: actor.staffUserId,
    });
  } else {
    await tx
      .update(deliverySetting)
      .set({ defaultMinor: amountMinor, updatedAt: new Date(), updatedByStaffId: actor.staffUserId })
      .where(sql`${deliverySetting.id} = 1`);
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'delivery.default_updated',
    entityType: 'delivery_setting',
    entityId: 1,
    before: { defaultMinor: before },
    after: { defaultMinor: amountMinor },
  });
}

/**
 * Creates or updates one district override.
 *
 * Saving an existing inactive row reactivates it with the new amount; the unique district index makes a
 * second row for the same district impossible even under a race.
 */
export async function setDistrictDeliveryCharge(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly districtCode: unknown; readonly amount: unknown },
): Promise<void> {
  const districtCode = requireOverrideArea(input.districtCode);
  const existingRows = await tx
    .select({
      id: deliveryDistrictCharge.id,
      amountMinor: deliveryDistrictCharge.amountMinor,
      isActive: deliveryDistrictCharge.isActive,
    })
    .from(deliveryDistrictCharge)
    .where(sql`${deliveryDistrictCharge.districtCode} = ${districtCode}`);
  const existing = existingRows[0];

  await requirePermission(
    actor,
    PERMISSIONS.settingsWrite,
    'delivery_district_charge',
    existing?.id ?? 0,
  );

  const amountMinor = parseDeliveryAmount(input.amount);
  if (amountMinor === null) throw new ValidationError('delivery charge must be a valid BDT amount');

  let entityId: number;
  if (existing === undefined) {
    const inserted = await tx
      .insert(deliveryDistrictCharge)
      .values({
        districtCode,
        amountMinor,
        isActive: true,
        updatedByStaffId: actor.staffUserId,
      })
      .returning({ id: deliveryDistrictCharge.id });
    const row = inserted[0];
    if (row === undefined) throw new Error('district charge insert returned no id');
    entityId = row.id;
  } else {
    await tx
      .update(deliveryDistrictCharge)
      .set({ amountMinor, isActive: true, updatedAt: new Date(), updatedByStaffId: actor.staffUserId })
      .where(sql`${deliveryDistrictCharge.id} = ${existing.id}`);
    entityId = existing.id;
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'delivery.district_saved',
    entityType: 'delivery_district_charge',
    entityId,
    before: existing === undefined ? null : { amountMinor: existing.amountMinor, isActive: existing.isActive },
    after: { districtCode, amountMinor, isActive: true },
  });
}

/** Returns a district to the default charge. The row is kept, inactive, so its history is not lost. */
export async function deactivateDistrictDeliveryCharge(
  tx: Transaction,
  actor: ActorContext,
  rawDistrictCode: unknown,
): Promise<void> {
  const districtCode = requireOverrideArea(rawDistrictCode);
  const existingRows = await tx
    .select({
      id: deliveryDistrictCharge.id,
      amountMinor: deliveryDistrictCharge.amountMinor,
      isActive: deliveryDistrictCharge.isActive,
    })
    .from(deliveryDistrictCharge)
    .where(sql`${deliveryDistrictCharge.districtCode} = ${districtCode}`);
  const existing = existingRows[0];

  await requirePermission(
    actor,
    PERMISSIONS.settingsWrite,
    'delivery_district_charge',
    existing?.id ?? 0,
  );

  if (existing === undefined) throw new ValidationError('there is no override for that district');
  if (!existing.isActive) throw new ConflictError('that override is already inactive');

  await tx
    .update(deliveryDistrictCharge)
    .set({ isActive: false, updatedAt: new Date(), updatedByStaffId: actor.staffUserId })
    .where(sql`${deliveryDistrictCharge.id} = ${existing.id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'delivery.district_deactivated',
    entityType: 'delivery_district_charge',
    entityId: existing.id,
    before: { districtCode, amountMinor: existing.amountMinor, isActive: true },
    after: { districtCode, amountMinor: existing.amountMinor, isActive: false },
  });
}

/** The upper bound a page may present, re-exported so the form and the parser cannot disagree. */
export const DELIVERY_MAX_MINOR = MAX_PRICE_MINOR;
