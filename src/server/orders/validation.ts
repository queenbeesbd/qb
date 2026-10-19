/**
 * Order input validation - the boundary between what a browser claims and what the server will store.
 *
 * Pure functions over untrusted input; no database, no request object. Everything here treats the
 * submitted cart as a **claim**: ids and quantities only. Prices, totals and availability are never
 * read from a submission - they are resolved from the database in `./create`.
 *
 * The bounds mirror the client cart's own limits (`src/features/cart/cart-storage.ts`) and the
 * database CHECK constraints, so a refusal happens before a constraint violation rather than instead of
 * one.
 */

import { createHash } from 'node:crypto';

/** `order_item.quantity > 0`, and a bound on how large one order may be. */
export const ORDER_LIMITS = {
  maxLines: 40,
  maxQuantityPerLine: 20,
} as const;

export type CartLineInput = { readonly productId: string; readonly quantity: number };

export type ContactInput = {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine: string;
  readonly area: string;
  readonly city: string;
  readonly postcode: string | null;
  readonly deliveryNote: string | null;
};

/** Product ids are decimal strings of a bigint identity; never a UUID and never free text. */
const PRODUCT_ID_PATTERN = /^[1-9][0-9]{0,18}$/;

/** `order_contact.recipient_phone` CHECK. */
const PHONE_PATTERN = /^01[3-9][0-9]{8}$/;

function clampQuantity(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  const whole = Math.trunc(parsed);
  if (whole < 1) return null;
  return Math.min(whole, ORDER_LIMITS.maxQuantityPerLine);
}

/**
 * Parses the submitted cart.
 *
 * Accepts a JSON array of `{ productId, quantity }` (or `{ id, qty }`). Duplicate ids are merged so a
 * crafted body cannot create two lines for the same product, and the merged quantity is clamped. A
 * malformed body, an unknown id shape, an empty cart or more lines than the cap is `null` - refused,
 * never partially accepted.
 */
export function parseCartLines(value: unknown): CartLineInput[] | null {
  if (typeof value !== 'string' || value === '') return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(decoded) || decoded.length === 0) return null;

  const merged = new Map<string, number>();
  for (const entry of decoded) {
    if (typeof entry !== 'object' || entry === null) return null;
    const record = entry as Record<string, unknown>;
    const rawId = record.productId ?? record.id;
    const quantity = clampQuantity(record.quantity ?? record.qty);
    if (typeof rawId !== 'string' || !PRODUCT_ID_PATTERN.test(rawId) || quantity === null) {
      return null;
    }
    merged.set(rawId, Math.min(ORDER_LIMITS.maxQuantityPerLine, (merged.get(rawId) ?? 0) + quantity));
  }

  if (merged.size === 0 || merged.size > ORDER_LIMITS.maxLines) return null;
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Reads a bounded, required single-line text field. Returns `null` when absent or out of bounds. */
export function parseText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < min || normalized.length > max) return null;
  return normalized;
}

/** Reads an optional bounded text field. Blank normalises to `null`, not an empty string. */
export function parseOptionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized === '') return null;
  if (normalized.length > max) return undefined;
  return normalized;
}

/**
 * Parses the delivery contact block, matching `order_contact`'s CHECK constraints exactly.
 * Returns `null` for any invalid field, so a partially valid address is never stored.
 */
export function parseContact(form: {
  recipientName: unknown;
  recipientPhone: unknown;
  addressLine: unknown;
  area: unknown;
  city: unknown;
  postcode: unknown;
  deliveryNote: unknown;
}): ContactInput | null {
  const recipientName = parseText(form.recipientName, 2, 120);
  const addressLine = parseText(form.addressLine, 5, 300);
  const area = parseText(form.area, 1, 80);
  const city = parseText(form.city, 1, 80);
  const phone = typeof form.recipientPhone === 'string' ? form.recipientPhone.trim() : '';
  const postcode = parseOptionalText(form.postcode, 20);
  const deliveryNote = parseOptionalText(form.deliveryNote, 300);

  if (recipientName === null || addressLine === null || area === null || city === null) return null;
  if (!PHONE_PATTERN.test(phone)) return null;
  if (postcode === undefined || deliveryNote === undefined) return null;

  return { recipientName, recipientPhone: phone, addressLine, area, city, postcode, deliveryNote };
}

/**
 * A stable digest of what was submitted, used to detect a reused idempotency key with a *different*
 * body. It is compared, never stored as the order - the order's own amounts come from the database.
 *
 * The payment method is deliberately absent: Cash on Delivery is the only method this release accepts,
 * so it is not part of the submitted body and cannot vary between two submissions of the same order.
 */
export function orderFingerprint(lines: readonly CartLineInput[], contact: ContactInput): string {
  const canonical = JSON.stringify({
    lines: [...lines].sort((a, b) => a.productId.localeCompare(b.productId)),
    contact,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** The client-generated submission key shape (`idempotency_key.key` CHECK is 16..128 characters). */
export function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(trimmed)) return null;
  return trimmed;
}
