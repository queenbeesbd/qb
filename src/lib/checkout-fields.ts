/**
 * Checkout contact rules - **one definition, two callers**.
 *
 * The checkout form validates what it is about to submit so the customer reads a summary instead of a
 * browser bubble, and the order route validates the same values again from the submission. Those two
 * must never disagree: a form that accepts what the server refuses produces an order that redirects
 * back with "invalid" and no explanation, and a form that refuses what the server accepts loses a real
 * order.
 *
 * So the bounds and the phone shape live **here**, in a module with no database, no request object and
 * no Node built-in, and `src/server/orders/validation.ts` reads the same constants. This file is
 * client-safe on purpose; it must never import a server module.
 *
 * The rules mirror `order_contact`'s CHECK constraints. Changing a bound is a schema change, not a
 * styling tweak.
 */

import { isDeliveryAreaCode } from './delivery-areas';

/** Bounds per contact field. `min` is measured after whitespace normalisation. */
export const CONTACT_LIMITS = {
  recipientName: { min: 2, max: 120 },
  addressLine: { min: 5, max: 300 },
  area: { min: 1, max: 80 },
  city: { min: 1, max: 80 },
  postcode: { max: 20 },
  deliveryNote: { max: 300 },
} as const;

/**
 * Bangladeshi mobile shape, exactly as `order_contact.recipient_phone` requires it: 11 digits with a
 * `01[3-9]` prefix. The form uses it as a `pattern` for the keyboard hint and this module uses it for
 * the real check; the server never trusts the attribute.
 */
export const RECIPIENT_PHONE_PATTERN = /^01[3-9][0-9]{8}$/;

/** The fields the checkout form reports problems for, in the order they appear on the page. */
export const CONTACT_FIELDS = [
  'recipientName',
  'recipientPhone',
  'addressLine',
  'districtCode',
  'area',
  'city',
  'postcode',
  'deliveryNote',
] as const;

export type ContactFieldName = (typeof CONTACT_FIELDS)[number];

/** Every contact value as a string; optional fields use an empty string when untouched. */
export type ContactValues = Readonly<Record<ContactFieldName, string>>;

/**
 * The normalisation the server applies before storing a value: runs of whitespace collapse to one
 * space and the ends are trimmed. Applied on both sides so "  Amina  " and "Amina" are the same value.
 */
export function normalizeContactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function withinBounds(value: string, min: number, max: number): boolean {
  const normalized = normalizeContactText(value);
  return normalized.length >= min && normalized.length <= max;
}

/**
 * The fields a submission would be refused for, in page order. An empty array means the contact block
 * is valid and the order may be posted.
 *
 * This mirrors `parseContact` exactly: same bounds, same phone shape, same district allowlist, same
 * optional-field handling. It is a reporting layer - the server remains the authority.
 */
export function contactProblems(values: ContactValues): ContactFieldName[] {
  const problems: ContactFieldName[] = [];

  if (!withinBounds(values.recipientName, CONTACT_LIMITS.recipientName.min, CONTACT_LIMITS.recipientName.max)) {
    problems.push('recipientName');
  }
  if (!RECIPIENT_PHONE_PATTERN.test(values.recipientPhone.trim())) {
    problems.push('recipientPhone');
  }
  if (!withinBounds(values.addressLine, CONTACT_LIMITS.addressLine.min, CONTACT_LIMITS.addressLine.max)) {
    problems.push('addressLine');
  }
  if (!isDeliveryAreaCode(values.districtCode)) {
    problems.push('districtCode');
  }
  if (!withinBounds(values.area, CONTACT_LIMITS.area.min, CONTACT_LIMITS.area.max)) {
    problems.push('area');
  }
  if (!withinBounds(values.city, CONTACT_LIMITS.city.min, CONTACT_LIMITS.city.max)) {
    problems.push('city');
  }
  if (normalizeContactText(values.postcode).length > CONTACT_LIMITS.postcode.max) {
    problems.push('postcode');
  }
  if (normalizeContactText(values.deliveryNote).length > CONTACT_LIMITS.deliveryNote.max) {
    problems.push('deliveryNote');
  }

  return problems;
}
