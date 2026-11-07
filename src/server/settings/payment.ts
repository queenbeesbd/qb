/**
 * The payment instructions the checkout publishes (ADR 0029).
 *
 * **This is an instruction, not a payment method.** Cash on Delivery remains the only method the shop
 * accepts and the order record is unchanged: nothing here writes a payment state, a claim or a
 * verification. The block tells a customer which orders are expected to pay the delivery charge in
 * advance, which orders may prepay in full for the gift, and where to send that money - and the owner
 * confirms the transfer on the phone, exactly as before.
 *
 * Values live in `store_setting`, so the number and the wording are data. Four keys:
 *
 * - `payment.instructions` - the owner's paragraphs, rendered one per line as plain text;
 * - `payment.bkash_number` - an 11-digit Bangladeshi mobile, shown with a copy button;
 * - `payment.send_money_note` - the "Payment, not Send Money" caution;
 * - `payment.advance_threshold_minor` - the goods subtotal below which the delivery charge is payable
 *   in advance (default 500 BDT).
 *
 * An absent row means **not saved yet**, and the checkout falls back to the owner's supplied defaults
 * in `src/data/payment-instructions.ts`. A saved blank means the owner unpublished that field: the
 * paragraph is not rendered, the number block disappears, and the page says the shop has not published
 * a way to pay in advance rather than inventing one.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import {
  DEFAULT_ADVANCE_THRESHOLD_MINOR,
  DEFAULT_BKASH_NUMBER,
  DEFAULT_PAYMENT_INSTRUCTIONS,
  DEFAULT_SEND_MONEY_NOTE,
} from '@/data/payment-instructions';
import { storeSetting } from '@/db/schema';
import { RECIPIENT_PHONE_PATTERN } from '@/lib/checkout-fields';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';
import { parsePoisha } from '@/server/catalog/validation';

export const PAYMENT_INSTRUCTIONS_KEY = 'payment.instructions';
export const PAYMENT_BKASH_NUMBER_KEY = 'payment.bkash_number';
export const PAYMENT_SEND_MONEY_NOTE_KEY = 'payment.send_money_note';
export const PAYMENT_ADVANCE_THRESHOLD_KEY = 'payment.advance_threshold_minor';

/** Bounds are formatting limits, not policy. */
export const PAYMENT_MAX = { instructions: 2000, note: 220 } as const;

export type PaymentInstructions = {
  /** May be empty: the owner unpublished the paragraphs. Never HTML. */
  readonly instructions: string;
  /** `null` when unpublished - no copy button is drawn for a number that does not exist. */
  readonly bkashNumber: string | null;
  readonly sendMoneyNote: string | null;
  /** Poisha. Below this goods subtotal the delivery charge is expected in advance. */
  readonly advanceThresholdMinor: number;
};

const DEFAULTS: PaymentInstructions = {
  instructions: DEFAULT_PAYMENT_INSTRUCTIONS,
  bkashNumber: DEFAULT_BKASH_NUMBER,
  sendMoneyNote: DEFAULT_SEND_MONEY_NOTE,
  advanceThresholdMinor: DEFAULT_ADVANCE_THRESHOLD_MINOR,
};

/** The paragraphs a component renders, one per line. Empty lines are dropped. */
export function instructionParagraphs(instructions: string): string[] {
  return instructions
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Plain text only: a `<` or `>` is refused rather than stripped (the contact/policy rule). */
function plainText(raw: unknown, label: string, max: number): string {
  if (typeof raw !== 'string') throw new ValidationError(`the ${label} must be text`);
  const value = raw.replace(/\r\n/g, '\n').trim();
  if (value.length > max) throw new ValidationError(`the ${label} must be ${max} characters or fewer`);
  if (value.includes('<') || value.includes('>')) {
    throw new ValidationError(`the ${label} cannot contain < or >`);
  }
  return value;
}

export function parseBkashNumber(raw: unknown): string | null {
  const value = text(raw).trim();
  if (value.length === 0) return null;
  if (!RECIPIENT_PHONE_PATTERN.test(value)) {
    throw new ValidationError('the bKash number must be an 11-digit Bangladeshi mobile number');
  }
  return value;
}

export function parseAdvanceThreshold(raw: unknown): number {
  const value = text(raw).trim();
  if (value.length === 0) return DEFAULT_ADVANCE_THRESHOLD_MINOR;
  const amount = parsePoisha(value, { allowZero: false });
  if (amount === null) throw new ValidationError('the advance threshold must be a BDT amount above zero');
  return amount;
}

/** Reads the four keys. A missing row is the default; a saved blank is an intentional absence. */
export async function loadPaymentInstructions(tx: Transaction): Promise<PaymentInstructions> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(
      sql`${storeSetting.key} in (${PAYMENT_INSTRUCTIONS_KEY}, ${PAYMENT_BKASH_NUMBER_KEY}, ${PAYMENT_SEND_MONEY_NOTE_KEY}, ${PAYMENT_ADVANCE_THRESHOLD_KEY})`,
    );

  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const instructions = stored.has(PAYMENT_INSTRUCTIONS_KEY)
    ? text(stored.get(PAYMENT_INSTRUCTIONS_KEY)).trim()
    : DEFAULTS.instructions;
  const defaultBkash = DEFAULTS.bkashNumber ?? '';
  const defaultNote = DEFAULTS.sendMoneyNote ?? '';
  const bkash = stored.has(PAYMENT_BKASH_NUMBER_KEY)
    ? text(stored.get(PAYMENT_BKASH_NUMBER_KEY)).trim()
    : defaultBkash;
  const note = stored.has(PAYMENT_SEND_MONEY_NOTE_KEY)
    ? text(stored.get(PAYMENT_SEND_MONEY_NOTE_KEY)).trim()
    : defaultNote;
  const threshold = stored.has(PAYMENT_ADVANCE_THRESHOLD_KEY)
    ? Number(stored.get(PAYMENT_ADVANCE_THRESHOLD_KEY))
    : DEFAULTS.advanceThresholdMinor;

  return {
    instructions,
    bkashNumber: bkash.length === 0 ? null : bkash,
    sendMoneyNote: note.length === 0 ? null : note,
    advanceThresholdMinor:
      Number.isSafeInteger(threshold) && threshold > 0 ? threshold : DEFAULTS.advanceThresholdMinor,
  };
}

/** Saves the four values. The change and its audit record share the caller's transaction. */
export async function savePaymentInstructions(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly instructions: unknown;
    readonly bkashNumber: unknown;
    readonly sendMoneyNote: unknown;
    readonly advanceThreshold: unknown;
  },
): Promise<PaymentInstructions> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const before = await loadPaymentInstructions(tx);
  const note = plainText(input.sendMoneyNote, 'the send-money note', PAYMENT_MAX.note);
  const next: PaymentInstructions = {
    instructions: plainText(input.instructions, 'payment instructions', PAYMENT_MAX.instructions),
    bkashNumber: parseBkashNumber(input.bkashNumber),
    sendMoneyNote: note.length === 0 ? null : note,
    advanceThresholdMinor: parseAdvanceThreshold(input.advanceThreshold),
  };

  const values = [
    { key: PAYMENT_INSTRUCTIONS_KEY, value: next.instructions, valueType: 'text' },
    { key: PAYMENT_BKASH_NUMBER_KEY, value: next.bkashNumber ?? '', valueType: 'text' },
    { key: PAYMENT_SEND_MONEY_NOTE_KEY, value: next.sendMoneyNote ?? '', valueType: 'text' },
    { key: PAYMENT_ADVANCE_THRESHOLD_KEY, value: next.advanceThresholdMinor, valueType: 'money_minor' },
  ];

  await tx
    .insert(storeSetting)
    .values(values.map((row) => ({ ...row, updatedByStaffId: actor.staffUserId })))
    .onConflictDoUpdate({
      target: storeSetting.key,
      set: {
        value: sql`excluded.value`,
        valueType: sql`excluded.value_type`,
        updatedAt: sql`now()`,
        updatedByStaffId: actor.staffUserId,
      },
    });

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.payment_instructions_updated',
    entityType: 'store_setting',
    entityId: 1,
    before: { ...before },
    after: { ...next },
  });

  return next;
}
