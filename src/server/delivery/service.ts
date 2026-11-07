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
import { deliveryDistrictCharge, deliverySetting, order } from '@/db/schema';
import { deliveryAreaByCode } from '@/lib/delivery-areas';
import type { DeliveryRates } from '@/lib/delivery';
import { MAX_PRICE_MINOR, parsePoisha } from '@/server/catalog/validation';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

export type {
  DeliveryPricingContext,
  DeliveryQuote,
  DeliveryQuoteResult,
  DeliveryRates,
} from '@/lib/delivery';
export { quoteDelivery, quoteOrderDelivery, repeatDiscountMinor } from '@/lib/delivery';

/** Reads the current configuration. Absent configuration is represented as `null`, never as zero. */
export async function loadDeliveryRates(tx: Transaction): Promise<DeliveryRates> {
  const settingRows = await tx
    .select({
      defaultMinor: deliverySetting.defaultMinor,
      conditionalEnabled: deliverySetting.conditionalEnabled,
      conditionalMinSubtotalMinor: deliverySetting.conditionalMinSubtotalMinor,
      conditionalDhakaMinor: deliverySetting.conditionalDhakaMinor,
      conditionalChattogramMinor: deliverySetting.conditionalChattogramMinor,
      conditionalOthersMinor: deliverySetting.conditionalOthersMinor,
      repeatDeliveryEnabled: deliverySetting.repeatDeliveryEnabled,
      repeatChattogramMinor: deliverySetting.repeatChattogramMinor,
      repeatOthersMinor: deliverySetting.repeatOthersMinor,
      repeatDiscountEnabled: deliverySetting.repeatDiscountEnabled,
      repeatDiscountPercent: deliverySetting.repeatDiscountPercent,
      repeatDiscountMinSubtotalMinor: deliverySetting.repeatDiscountMinSubtotalMinor,
    })
    .from(deliverySetting)
    .where(sql`${deliverySetting.id} = 1`);

  const overrideRows = await tx
    .select({ districtCode: deliveryDistrictCharge.districtCode, amountMinor: deliveryDistrictCharge.amountMinor })
    .from(deliveryDistrictCharge)
    .where(sql`${deliveryDistrictCharge.isActive}`);

  const row = settingRows[0];
  return {
    defaultMinor: row?.defaultMinor ?? null,
    overrides: new Map(overrideRows.map((entry) => [entry.districtCode, entry.amountMinor])),
    // An absent settings row is an unconfigured shop: every optional rule is off, not defaulted on.
    conditional: {
      enabled: row?.conditionalEnabled ?? false,
      minSubtotalMinor: row?.conditionalMinSubtotalMinor ?? null,
      dhakaMinor: row?.conditionalDhakaMinor ?? null,
      chattogramMinor: row?.conditionalChattogramMinor ?? null,
      othersMinor: row?.conditionalOthersMinor ?? null,
    },
    repeat: {
      enabled: row?.repeatDeliveryEnabled ?? false,
      chattogramMinor: row?.repeatChattogramMinor ?? null,
      othersMinor: row?.repeatOthersMinor ?? null,
    },
    repeatDiscount: {
      enabled: row?.repeatDiscountEnabled ?? false,
      percent: row?.repeatDiscountPercent ?? null,
      minSubtotalMinor: row?.repeatDiscountMinSubtotalMinor ?? null,
    },
  };
}

/**
 * Whether this customer has completed a purchase before.
 *
 * **`status = 'completed'` is the definition**, and it is the only one that satisfies the rule: an
 * order reaches `completed` only after the owner recorded the cash (`cod_collected`, ADR 0017), so
 * pending, cancelled, rejected and unpaid orders cannot make anybody a repeat customer. A guest
 * (`customerId === null`) never qualifies - there is no history to have.
 */
export async function isRepeatCustomer(tx: Transaction, customerId: number | null): Promise<boolean> {
  if (customerId === null) return false;
  const rows = await tx
    .select({ completed: sql<number>`count(*)::int` })
    .from(order)
    .where(sql`${order.customerId} = ${customerId} and ${order.status} = 'completed'`);
  return (rows[0]?.completed ?? 0) > 0;
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

// ------------------------------------------------------------------
// Optional pricing rules (ADR 0029)
// ------------------------------------------------------------------

/** A blank field is `null`: the rule has no value for that area and will fall through. */
function optionalAmount(raw: unknown, label: string): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const amount = parseDeliveryAmount(raw);
  if (amount === null) throw new ValidationError(`${label} must be a valid BDT amount`);
  return amount;
}

function parsePercent(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new ValidationError('the discount must be a whole percentage between 1 and 100');
  }
  return value;
}

function isOn(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === 'on';
}

type RuleRow = {
  id: number;
  defaultMinor: number | null;
  conditionalEnabled: boolean;
  conditionalMinSubtotalMinor: number | null;
  conditionalDhakaMinor: number | null;
  conditionalChattogramMinor: number | null;
  conditionalOthersMinor: number | null;
  repeatDeliveryEnabled: boolean;
  repeatChattogramMinor: number | null;
  repeatOthersMinor: number | null;
  repeatDiscountEnabled: boolean;
  repeatDiscountPercent: number | null;
  repeatDiscountMinSubtotalMinor: number | null;
};

async function loadRuleRow(tx: Transaction): Promise<RuleRow | null> {
  const rows = await tx
    .select({
      id: deliverySetting.id,
      defaultMinor: deliverySetting.defaultMinor,
      conditionalEnabled: deliverySetting.conditionalEnabled,
      conditionalMinSubtotalMinor: deliverySetting.conditionalMinSubtotalMinor,
      conditionalDhakaMinor: deliverySetting.conditionalDhakaMinor,
      conditionalChattogramMinor: deliverySetting.conditionalChattogramMinor,
      conditionalOthersMinor: deliverySetting.conditionalOthersMinor,
      repeatDeliveryEnabled: deliverySetting.repeatDeliveryEnabled,
      repeatChattogramMinor: deliverySetting.repeatChattogramMinor,
      repeatOthersMinor: deliverySetting.repeatOthersMinor,
      repeatDiscountEnabled: deliverySetting.repeatDiscountEnabled,
      repeatDiscountPercent: deliverySetting.repeatDiscountPercent,
      repeatDiscountMinSubtotalMinor: deliverySetting.repeatDiscountMinSubtotalMinor,
    })
    .from(deliverySetting)
    .where(sql`${deliverySetting.id} = 1`);
  return rows[0] ?? null;
}

/**
 * Creates the singleton row when it does not exist yet, so a rule can be saved on a shop whose default
 * charge has never been configured. The default stays `null` - saving a benefit is not configuring the
 * required default charge, and checkout still refuses until the owner sets it.
 */
async function ensureRuleRow(tx: Transaction, actor: ActorContext): Promise<RuleRow> {
  const existing = await loadRuleRow(tx);
  if (existing !== null) return existing;
  await tx.insert(deliverySetting).values({ id: 1, defaultMinor: null, updatedByStaffId: actor.staffUserId });
  const created = await loadRuleRow(tx);
  if (created === null) throw new Error('delivery settings row was not created');
  return created;
}

/**
 * Saves the conditional delivery rule: a lower charge for a signed-in customer whose subtotal reaches
 * the configured minimum. Switching it on requires a minimum and all three area rates, so the owner
 * cannot leave a half-configured rule silently doing nothing.
 */
export async function saveConditionalDelivery(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly enabled: unknown;
    readonly minSubtotal: unknown;
    readonly dhaka: unknown;
    readonly chattogram: unknown;
    readonly others: unknown;
  },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'delivery_setting', 1);

  const before = await ensureRuleRow(tx, actor);
  const enabled = isOn(input.enabled);
  const minSubtotalMinor = optionalAmount(input.minSubtotal, 'the minimum purchase');
  const dhakaMinor = optionalAmount(input.dhaka, 'the Dhaka charge');
  const chattogramMinor = optionalAmount(input.chattogram, 'the Chattogram charge');
  const othersMinor = optionalAmount(input.others, 'the other-districts charge');

  if (
    enabled &&
    (minSubtotalMinor === null ||
      dhakaMinor === null ||
      chattogramMinor === null ||
      othersMinor === null)
  ) {
    throw new ValidationError('a minimum purchase and all three area charges are required to switch this on');
  }

  await tx
    .update(deliverySetting)
    .set({
      conditionalEnabled: enabled,
      conditionalMinSubtotalMinor: minSubtotalMinor,
      conditionalDhakaMinor: dhakaMinor,
      conditionalChattogramMinor: chattogramMinor,
      conditionalOthersMinor: othersMinor,
      updatedAt: new Date(),
      updatedByStaffId: actor.staffUserId,
    })
    .where(sql`${deliverySetting.id} = 1`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'delivery.conditional_updated',
    entityType: 'delivery_setting',
    entityId: 1,
    before: {
      enabled: before.conditionalEnabled,
      minSubtotalMinor: before.conditionalMinSubtotalMinor,
      dhakaMinor: before.conditionalDhakaMinor,
      chattogramMinor: before.conditionalChattogramMinor,
      othersMinor: before.conditionalOthersMinor,
    },
    after: { enabled, minSubtotalMinor, dhakaMinor, chattogramMinor, othersMinor },
  });
}

/**
 * Saves the repeat-customer delivery rule. Two rates, not three: Chattogram has its own, and Dhaka plus
 * every other district share the second one - the benefit is deliberately simpler than the conditional
 * rule it takes priority over.
 */
export async function saveRepeatDelivery(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly enabled: unknown; readonly chattogram: unknown; readonly others: unknown },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'delivery_setting', 1);

  const before = await ensureRuleRow(tx, actor);
  const enabled = isOn(input.enabled);
  const chattogramMinor = optionalAmount(input.chattogram, 'the Chattogram charge');
  const othersMinor = optionalAmount(input.others, 'the other-districts charge');

  if (enabled && (chattogramMinor === null || othersMinor === null)) {
    throw new ValidationError('both repeat-customer charges are required to switch this on');
  }

  await tx
    .update(deliverySetting)
    .set({
      repeatDeliveryEnabled: enabled,
      repeatChattogramMinor: chattogramMinor,
      repeatOthersMinor: othersMinor,
      updatedAt: new Date(),
      updatedByStaffId: actor.staffUserId,
    })
    .where(sql`${deliverySetting.id} = 1`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'delivery.repeat_delivery_updated',
    entityType: 'delivery_setting',
    entityId: 1,
    before: {
      enabled: before.repeatDeliveryEnabled,
      chattogramMinor: before.repeatChattogramMinor,
      othersMinor: before.repeatOthersMinor,
    },
    after: { enabled, chattogramMinor, othersMinor },
  });
}

/**
 * Saves the automatic repeat-customer discount. The percentage is a whole number and the minimum is a
 * BDT amount; the discount itself is computed at checkout and at order creation from this rule, never
 * stored as a rate on an order.
 */
export async function saveRepeatDiscount(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly enabled: unknown; readonly percent: unknown; readonly minSubtotal: unknown },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'delivery_setting', 1);

  const before = await ensureRuleRow(tx, actor);
  const enabled = isOn(input.enabled);
  const percent = parsePercent(input.percent);
  const minSubtotalMinor = optionalAmount(input.minSubtotal, 'the minimum purchase');

  if (enabled && (percent === null || minSubtotalMinor === null)) {
    throw new ValidationError('a percentage and a minimum purchase are required to switch this on');
  }

  await tx
    .update(deliverySetting)
    .set({
      repeatDiscountEnabled: enabled,
      repeatDiscountPercent: percent,
      repeatDiscountMinSubtotalMinor: minSubtotalMinor,
      updatedAt: new Date(),
      updatedByStaffId: actor.staffUserId,
    })
    .where(sql`${deliverySetting.id} = 1`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'delivery.repeat_discount_updated',
    entityType: 'delivery_setting',
    entityId: 1,
    before: {
      enabled: before.repeatDiscountEnabled,
      percent: before.repeatDiscountPercent,
      minSubtotalMinor: before.repeatDiscountMinSubtotalMinor,
    },
    after: { enabled, percent, minSubtotalMinor },
  });
}

/** The upper bound a page may present, re-exported so the form and the parser cannot disagree. */
export const DELIVERY_MAX_MINOR = MAX_PRICE_MINOR;
