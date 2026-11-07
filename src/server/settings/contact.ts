/**
 * The shop's own contact facts and the policy text it is willing to publish (Phase 51).
 *
 * Stored in the existing `store_setting` key/value table, so this needs **no schema change and no
 * migration**, exactly like the announcement, the guest switch and the support links.
 *
 * Three rules shape this module:
 *
 * 1. **The owner's words, never engineering's.** Nothing here supplies a phone number, an opening hour,
 *    a delivery deadline, a return window or a refund sentence. An unset field is `null` and the page
 *    states the gap; a value that exists is published verbatim.
 * 2. **Plain text.** These fields are rendered as paragraphs with React's text escaping, so no HTML,
 *    no markdown and no `dangerouslySetInnerHTML` is ever involved. A `<` is refused rather than
 *    stripped, because silently rewriting the owner's sentence is worse than making them retype it.
 * 3. **A phone number is linkified, not parsed.** It is only used as a `tel:` target after the format
 *    rule below, and never as a message, a name or anything else.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

export const CONTACT_PHONE_KEY = 'contact.phone';
export const CONTACT_HOURS_KEY = 'contact.hours';
export const CONTACT_ADDRESS_KEY = 'contact.address';
export const POLICY_DELIVERY_KEY = 'policy.delivery';
export const POLICY_RETURNS_KEY = 'policy.returns';
export const POLICY_PRIVACY_KEY = 'policy.privacy';
export const POLICY_TERMS_KEY = 'policy.terms';

/** The four policy pages, in the order the footer offers them. */
export const POLICY_KEYS = {
  delivery: POLICY_DELIVERY_KEY,
  returns: POLICY_RETURNS_KEY,
  privacy: POLICY_PRIVACY_KEY,
  terms: POLICY_TERMS_KEY,
} as const;

export type PolicySlug = keyof typeof POLICY_KEYS;

export const POLICY_SLUGS = Object.keys(POLICY_KEYS) as readonly PolicySlug[];

export function isPolicySlug(value: string): value is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(value);
}

/** Bounds are formatting limits, not policy: an address is not a paragraph and a policy is not a book. */
export const CONTACT_MAX = { phone: 24, hours: 160, address: 240, policy: 4000 } as const;

export type StoreContact = {
  /** `null` when unpublished. The storefront must show a stated gap, never a placeholder. */
  readonly phone: string | null;
  readonly hours: string | null;
  readonly address: string | null;
  readonly delivery: string | null;
  readonly returns: string | null;
  readonly privacy: string | null;
  readonly terms: string | null;
};

export const EMPTY_CONTACT: StoreContact = {
  phone: null,
  hours: null,
  address: null,
  delivery: null,
  returns: null,
  privacy: null,
  terms: null,
};

/** True when nothing at all has been published, so the contact page can say so once. */
export function isEmptyContact(contact: StoreContact): boolean {
  return (
    contact.phone === null &&
    contact.hours === null &&
    contact.address === null
  );
}

const TEXT_KEYS = [
  CONTACT_PHONE_KEY,
  CONTACT_HOURS_KEY,
  CONTACT_ADDRESS_KEY,
  POLICY_DELIVERY_KEY,
  POLICY_RETURNS_KEY,
  POLICY_PRIVACY_KEY,
  POLICY_TERMS_KEY,
] as const;

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readRow(contact: StoreContact, key: string, value: string | null): StoreContact {
  switch (key) {
    case CONTACT_PHONE_KEY:
      return { ...contact, phone: value };
    case CONTACT_HOURS_KEY:
      return { ...contact, hours: value };
    case CONTACT_ADDRESS_KEY:
      return { ...contact, address: value };
    case POLICY_DELIVERY_KEY:
      return { ...contact, delivery: value };
    case POLICY_RETURNS_KEY:
      return { ...contact, returns: value };
    case POLICY_PRIVACY_KEY:
      return { ...contact, privacy: value };
    case POLICY_TERMS_KEY:
      return { ...contact, terms: value };
    default:
      return contact;
  }
}

/** Reads every published fact. A missing row is `null`, not an empty string pretending to be one. */
export async function loadStoreContact(tx: Transaction): Promise<StoreContact> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(sql`${storeSetting.key} in (${sql.join(
      TEXT_KEYS.map((key) => sql`${key}`),
      sql`, `,
    )})`);

  let contact = EMPTY_CONTACT;
  for (const row of rows) contact = readRow(contact, row.key, asText(row.value));
  return contact;
}

/**
 * Free text, or `null` for an empty field.
 *
 * `<>` is refused because these values are published as text: accepting markup would invite a future
 * component to render it, which is the one thing the interface never does.
 */
export function parseContactText(value: unknown, label: string, max: number): string | null {
  if (typeof value !== 'string') throw new ValidationError(`${label.toLowerCase()} must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new ValidationError(`${label.toLowerCase()} must be ${max} characters or fewer`);
  }
  if (/[<>]/.test(trimmed)) {
    throw new ValidationError(`${label.toLowerCase()} must be plain text, without < or >`);
  }
  return trimmed;
}

/**
 * A published phone number, or `null` for an empty field.
 *
 * The rule is mechanical, not regional: digits, with optional `+`, spaces, brackets and hyphens, 6 to 15
 * digits. Guessing a country's format or rewriting a number would be inventing the owner's contact
 * detail for them, so anything outside this shape is a refusal they can see.
 */
export function parseContactPhone(value: unknown): string | null {
  if (typeof value !== 'string') throw new ValidationError('the phone number must be text');
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > CONTACT_MAX.phone) {
    throw new ValidationError(`the phone number must be ${CONTACT_MAX.phone} characters or fewer`);
  }
  if (!/^[0-9+()\-\s]+$/.test(trimmed)) {
    throw new ValidationError('the phone number may contain only digits, spaces, +, - and brackets');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) {
    throw new ValidationError('the phone number must contain 6 to 15 digits');
  }
  return trimmed;
}

/** The digits with a single leading `+`, so a `tel:` target never contains spaces or brackets. */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return `tel:${digits}`;
}

/**
 * Saves every field in one write. Clearing a field removes it from the storefront; the change and its
 * audit record share the caller's transaction, so the trail can never describe a change that did not
 * commit.
 */
export async function saveStoreContact(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly phone: unknown;
    readonly hours: unknown;
    readonly address: unknown;
    readonly delivery: unknown;
    readonly returns: unknown;
    readonly privacy: unknown;
    readonly terms: unknown;
  },
): Promise<StoreContact> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const next: StoreContact = {
    phone: parseContactPhone(input.phone),
    hours: parseContactText(input.hours, 'Opening hours', CONTACT_MAX.hours),
    address: parseContactText(input.address, 'Shop address', CONTACT_MAX.address),
    delivery: parseContactText(input.delivery, 'Delivery information', CONTACT_MAX.policy),
    returns: parseContactText(input.returns, 'Returns information', CONTACT_MAX.policy),
    privacy: parseContactText(input.privacy, 'Privacy text', CONTACT_MAX.policy),
    terms: parseContactText(input.terms, 'Terms text', CONTACT_MAX.policy),
  };

  const before = await loadStoreContact(tx);

  const keys = [
    { key: CONTACT_PHONE_KEY, value: next.phone },
    { key: CONTACT_HOURS_KEY, value: next.hours },
    { key: CONTACT_ADDRESS_KEY, value: next.address },
    { key: POLICY_DELIVERY_KEY, value: next.delivery },
    { key: POLICY_RETURNS_KEY, value: next.returns },
    { key: POLICY_PRIVACY_KEY, value: next.privacy },
    { key: POLICY_TERMS_KEY, value: next.terms },
  ];

  await tx
    .insert(storeSetting)
    .values(
      keys.map((entry) => ({
        key: entry.key,
        value: entry.value ?? '',
        valueType: 'text' as const,
        updatedByStaffId: actor.staffUserId,
      })),
    )
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
    action: 'settings.contact_updated',
    entityType: 'store_setting',
    entityId: 1,
    before: { ...before },
    after: { ...next },
  });

  return next;
}
