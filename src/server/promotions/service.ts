/**
 * Promotion codes - the one place a code is read, validated, evaluated and recorded.
 *
 * Three callers share it, and they must never disagree: the owner's screen, the checkout preview, and
 * order creation. The evaluator itself is pure (`src/lib/promo.ts`); this module supplies it with the
 * stored rule and the redemption count, and owns every write.
 *
 * **How a use is counted.** There is no counter. A use is a `promo_code_redemption` row written in the
 * order's own transaction, so the count and the orders that carry the code are the same fact. During
 * order creation the code row is locked (`for update`) before its uses are counted, so two simultaneous
 * checkouts cannot both take the last one.
 *
 * **Writing is owner-only in practice.** Every mutation re-checks `settings.write` at the service layer,
 * the same permission the delivery and announcement screens use, because a code sets a money policy.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { promoCode, promoCodeRedemption } from '@/db/schema';
import {
  evaluatePromo,
  normalizePromoCode,
  type PromoKind,
  type PromoRefusalReason,
  type PromoRule,
} from '@/lib/promo';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ConflictError, ValidationError, requirePermission, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';
import { parsePoisha } from '@/server/catalog/validation';

/** Upper bound for a code's own amounts, matching the price parser's sanity ceiling. */
export const PROMO_MAX_MINOR = 100_000_000;
/** A code longer than this is unreadable over a phone; the form and the schema agree on 32. */
export const PROMO_CODE_MAX_LENGTH = 32;

export type PromoCodeRow = {
  readonly id: number;
  readonly code: string;
  readonly description: string | null;
  readonly kind: PromoKind;
  readonly percentOff: number | null;
  readonly amountOffMinor: number | null;
  readonly minOrderMinor: number;
  readonly maxDiscountMinor: number | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly isActive: boolean;
  readonly redemptions: number;
  readonly discountGivenMinor: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const COLUMNS = {
  id: promoCode.id,
  code: promoCode.code,
  description: promoCode.description,
  kind: promoCode.kind,
  percentOff: promoCode.percentOff,
  amountOffMinor: promoCode.amountOffMinor,
  minOrderMinor: promoCode.minOrderMinor,
  maxDiscountMinor: promoCode.maxDiscountMinor,
  startsAt: promoCode.startsAt,
  endsAt: promoCode.endsAt,
  maxRedemptions: promoCode.maxRedemptions,
  isActive: promoCode.isActive,
  createdAt: promoCode.createdAt,
  updatedAt: promoCode.updatedAt,
} as const;

function toRow(
  row: Omit<PromoCodeRow, 'kind' | 'redemptions' | 'discountGivenMinor'> & {
    kind: string;
    redemptions: number;
    discountGivenMinor: number;
  },
): PromoCodeRow {
  return {
    ...row,
    kind: row.kind === 'fixed' ? 'fixed' : 'percent',
    redemptions: Number(row.redemptions),
    discountGivenMinor: Number(row.discountGivenMinor),
  };
}

/** Every code, newest first, each with its derived use count and the money it has given away. */
export async function listPromoCodes(tx: Transaction): Promise<PromoCodeRow[]> {
  const rows = await tx
    .select({
      ...COLUMNS,
      redemptions: sql<number>`count(${promoCodeRedemption.id})::int`,
      discountGivenMinor: sql<number>`coalesce(sum(${promoCodeRedemption.discountMinor}), 0)::bigint`,
    })
    .from(promoCode)
    .leftJoin(promoCodeRedemption, sql`${promoCodeRedemption.promoCodeId} = ${promoCode.id}`)
    .groupBy(sql`${promoCode.id}`)
    .orderBy(sql`${promoCode.isActive} desc, ${promoCode.createdAt} desc`);

  return rows.map((row) => toRow(row as never));
}

/** One code by id, or null. The editor and its refusal messages read from here. */
export async function getPromoCode(tx: Transaction, id: number): Promise<PromoCodeRow | null> {
  const rows = await tx
    .select({
      ...COLUMNS,
      redemptions: sql<number>`count(${promoCodeRedemption.id})::int`,
      discountGivenMinor: sql<number>`coalesce(sum(${promoCodeRedemption.discountMinor}), 0)::bigint`,
    })
    .from(promoCode)
    .leftJoin(promoCodeRedemption, sql`${promoCodeRedemption.promoCodeId} = ${promoCode.id}`)
    .where(sql`${promoCode.id} = ${id}`)
    .groupBy(sql`${promoCode.id}`);

  const row = rows[0];
  return row === undefined ? null : toRow(row as never);
}

/** A stored row as the pure evaluator sees it. */
export function toRule(row: PromoCodeRow): PromoRule {
  return {
    code: row.code,
    kind: row.kind,
    percentOff: row.percentOff,
    amountOffMinor: row.amountOffMinor,
    minOrderMinor: row.minOrderMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    isActive: row.isActive,
  };
}

export type PromoInput = {
  readonly code: unknown;
  readonly description: unknown;
  readonly kind: unknown;
  readonly percentOff: unknown;
  readonly amountOff: unknown;
  readonly minOrder: unknown;
  readonly maxDiscount: unknown;
  readonly startsAt: unknown;
  readonly endsAt: unknown;
  readonly maxRedemptions: unknown;
};

type ValidatedPromo = {
  code: string;
  description: string | null;
  kind: PromoKind;
  percentOff: number | null;
  amountOffMinor: number | null;
  minOrderMinor: number;
  maxDiscountMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
};

/** A date field ("2026-03-31") as the start of that day, local to the server. Empty means "no bound". */
function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) throw new ValidationError('a date must be written as YYYY-MM-DD');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) throw new ValidationError('that date does not exist');
  return date;
}

function parseOptionalCount(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 1_000_000) {
    throw new ValidationError('the use limit must be a whole number above zero');
  }
  return parsed;
}

/** Turns the form into the stored shape, or states what is wrong. The only validation of a code's fields. */
export function validatePromoInput(input: PromoInput): ValidatedPromo {
  const code = normalizePromoCode(input.code);
  if (code === null) {
    throw new ValidationError(
      'a code is 3 to 32 characters: capital letters, digits, hyphens or underscores',
    );
  }

  const descriptionRaw = typeof input.description === 'string' ? input.description.trim() : '';
  if (descriptionRaw.length > 200) throw new ValidationError('the note can be at most 200 characters');

  const kind: PromoKind = input.kind === 'fixed' ? 'fixed' : 'percent';

  let percentOff: number | null = null;
  let amountOffMinor: number | null = null;
  if (kind === 'percent') {
    const raw = typeof input.percentOff === 'string' ? input.percentOff.trim() : '';
    const parsed = Number.parseInt(raw, 10);
    if (!/^\d{1,3}$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new ValidationError('a percentage is a whole number between 1 and 100');
    }
    percentOff = parsed;
  } else {
    const parsed = parsePoisha(input.amountOff);
    if (parsed === null) throw new ValidationError('the amount off must be a valid BDT amount');
    amountOffMinor = parsed;
  }

  const minOrderMinor = input.minOrder === undefined || input.minOrder === ''
    ? 0
    : parsePoisha(input.minOrder, { allowZero: true });
  if (minOrderMinor === null) throw new ValidationError('the minimum order must be a valid BDT amount');

  let maxDiscountMinor: number | null = null;
  if (kind === 'percent' && typeof input.maxDiscount === 'string' && input.maxDiscount.trim() !== '') {
    maxDiscountMinor = parsePoisha(input.maxDiscount);
    if (maxDiscountMinor === null) throw new ValidationError('the discount cap must be a valid BDT amount');
  }

  const startsAt = parseDay(input.startsAt);
  const endsAtRaw = parseDay(input.endsAt);
  // A date the owner typed as the last day is usable *through* that day, so the stored bound is the
  // following midnight. The evaluator compares instants; nothing is left to interpretation at use.
  const endsAt = endsAtRaw === null ? null : new Date(endsAtRaw.getTime() + 24 * 60 * 60 * 1000);
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    throw new ValidationError('the end date must be after the start date');
  }

  const maxRedemptions = parseOptionalCount(input.maxRedemptions);

  return {
    code,
    description: descriptionRaw === '' ? null : descriptionRaw,
    kind,
    percentOff,
    amountOffMinor,
    minOrderMinor,
    maxDiscountMinor,
    startsAt,
    endsAt,
    maxRedemptions,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

/** Creates a code. The code string is unique by index; a second attempt states the clash instead of 500ing. */
export async function createPromoCode(
  tx: Transaction,
  actor: ActorContext,
  input: PromoInput,
): Promise<number> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'promo_code', 0);
  const values = validatePromoInput(input);

  const existing = await tx
    .select({ id: promoCode.id })
    .from(promoCode)
    .where(sql`${promoCode.code} = ${values.code}`);
  if (existing.length > 0) throw new ConflictError('that code already exists');

  let id: number;
  try {
    const inserted = await tx
      .insert(promoCode)
      .values({ ...values, createdByStaffId: actor.staffUserId, updatedByStaffId: actor.staffUserId })
      .returning({ id: promoCode.id });
    const row = inserted[0];
    if (row === undefined) throw new Error('promo code insert returned no id');
    id = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError('that code already exists');
    throw error;
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'promo.created',
    entityType: 'promo_code',
    entityId: id,
    after: auditShape(values),
  });

  return id;
}

/** Replaces a code's rules. Uses already recorded keep the discount they were given. */
export async function updatePromoCode(
  tx: Transaction,
  actor: ActorContext,
  id: number,
  input: PromoInput,
): Promise<void> {
  const before = await getPromoCode(tx, id);
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'promo_code', id);
  if (before === null) throw new ValidationError('that code does not exist');
  const values = validatePromoInput(input);

  const clash = await tx
    .select({ id: promoCode.id })
    .from(promoCode)
    .where(sql`${promoCode.code} = ${values.code} and ${promoCode.id} <> ${id}`);
  if (clash.length > 0) throw new ConflictError('another code already uses that string');

  try {
    await tx
      .update(promoCode)
      .set({ ...values, updatedAt: new Date(), updatedByStaffId: actor.staffUserId })
      .where(sql`${promoCode.id} = ${id}`);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError('another code already uses that string');
    throw error;
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'promo.updated',
    entityType: 'promo_code',
    entityId: id,
    before: auditShape(before),
    after: auditShape(values),
  });
}

/** Switches a code on or off. Switching off never rewrites an order that already used it. */
export async function setPromoCodeActive(
  tx: Transaction,
  actor: ActorContext,
  id: number,
  isActive: boolean,
): Promise<void> {
  const before = await getPromoCode(tx, id);
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'promo_code', id);
  if (before === null) throw new ValidationError('that code does not exist');
  if (before.isActive === isActive) throw new ConflictError('that code is already in that state');

  await tx
    .update(promoCode)
    .set({ isActive, updatedAt: new Date(), updatedByStaffId: actor.staffUserId })
    .where(sql`${promoCode.id} = ${id}`);

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: isActive ? 'promo.activated' : 'promo.deactivated',
    entityType: 'promo_code',
    entityId: id,
    before: { isActive: before.isActive },
    after: { isActive },
  });
}

/**
 * A bounded audit snapshot. No customer, no order and no code string beyond the code itself: a code is
 * published material, not a secret, so recording it is what makes the trail readable later.
 */
function auditShape(
  values: Omit<ValidatedPromo, 'description'> & { description?: string | null },
): Record<string, unknown> {
  return {
    code: values.code,
    kind: values.kind,
    percentOff: values.percentOff,
    amountOffMinor: values.amountOffMinor,
    minOrderMinor: values.minOrderMinor,
    maxDiscountMinor: values.maxDiscountMinor,
    startsAt: values.startsAt?.toISOString() ?? null,
    endsAt: values.endsAt?.toISOString() ?? null,
    maxRedemptions: values.maxRedemptions,
  };
}

/** Why a checkout attempt with a code did not apply. Mirrors the pure evaluator plus "no such code". */
export type PromoResolution =
  | { readonly ok: true; readonly promoCodeId: number; readonly code: string; readonly discountMinor: number }
  | { readonly ok: false; readonly reason: PromoRefusalReason };

/**
 * Evaluates a code for a subtotal **inside the caller's transaction**.
 *
 * `lock` is off for the checkout preview, where a stale answer only means a stale message, and **on**
 * for order creation, where the code row is locked so the use count cannot be read twice below its
 * limit. Returns a refusal rather than throwing: a bad code is a customer-facing sentence, not a bug.
 */
export async function resolvePromo(
  tx: Transaction,
  rawCode: unknown,
  subtotalMinor: number,
  options: { readonly lock: boolean },
): Promise<PromoResolution> {
  const code = normalizePromoCode(rawCode);
  if (code === null) return { ok: false, reason: 'unknown' };

  const query = tx
    .select(COLUMNS)
    .from(promoCode)
    .where(sql`${promoCode.code} = ${code}`);
  const rows = options.lock ? await query.for('update') : await query;

  const row = rows[0];
  if (row === undefined) return { ok: false, reason: 'unknown' };

  const counted = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(promoCodeRedemption)
    .where(sql`${promoCodeRedemption.promoCodeId} = ${row.id}`);

  const rule: PromoRule = {
    code: row.code,
    kind: row.kind === 'fixed' ? 'fixed' : 'percent',
    percentOff: row.percentOff,
    amountOffMinor: row.amountOffMinor,
    minOrderMinor: row.minOrderMinor,
    maxDiscountMinor: row.maxDiscountMinor,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    isActive: row.isActive,
  };

  const evaluation = evaluatePromo(rule, {
    subtotalMinor,
    now: new Date(),
    redemptions: Number(counted[0]?.total ?? 0),
  });

  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
  return {
    ok: true,
    promoCodeId: row.id,
    code: evaluation.code,
    discountMinor: evaluation.discountMinor,
  };
}

/**
 * Records the use, in the order's own transaction.
 *
 * If this insert fails the order fails with it, so a discount can never be stored without the row that
 * accounts for it - and a code can never be exhausted in the count while an order still received it.
 */
export async function recordPromoRedemption(
  tx: Transaction,
  input: {
    readonly promoCodeId: number;
    readonly orderId: number;
    /** `null` on a guest order: the redemption is a fact about the order, not about an account. */
    readonly customerId: number | null;
    readonly discountMinor: number;
  },
): Promise<void> {
  await tx.insert(promoCodeRedemption).values(input);
}

/** Promo totals for a period, for the analytics screen. Derived, never counted twice. */
export async function promoPeriodTotals(
  tx: Transaction,
  days: number,
): Promise<{ redemptions: number; discountGivenMinor: number; distinctCodes: number }> {
  const rows = await tx
    .select({
      redemptions: sql<number>`count(*)::int`,
      discountGivenMinor: sql<number>`coalesce(sum(${promoCodeRedemption.discountMinor}), 0)::bigint`,
      distinctCodes: sql<number>`count(distinct ${promoCodeRedemption.promoCodeId})::int`,
    })
    .from(promoCodeRedemption)
    // The database's own clock, so a redemption cannot be counted in a period the orders are not in.
    .where(sql`${promoCodeRedemption.createdAt} >= now() - make_interval(days => ${days})`);

  const row = rows[0];
  return {
    redemptions: Number(row?.redemptions ?? 0),
    discountGivenMinor: Number(row?.discountGivenMinor ?? 0),
    distinctCodes: Number(row?.distinctCodes ?? 0),
  };
}
