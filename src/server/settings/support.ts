/**
 * The storefront's two support links: Facebook and WhatsApp.
 *
 * Stored in the existing `store_setting` key/value table, so this needs **no schema change and no
 * migration**. The keys are the whole policy: an empty value means the button is not rendered - a
 * support button that goes nowhere would be worse than no button at all.
 *
 * **The value is a URL, and only ever a URL.** It is validated as an absolute `https` address with a
 * real host before it is stored, and it is rendered as an `href` on a fixed, owner-controlled control.
 * A `javascript:` or `data:` value cannot reach the page, a relative path cannot be smuggled in, and no
 * part of it is ever used as a name, a phone number or a message body.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

export const SUPPORT_FACEBOOK_URL_KEY = 'support.facebook_url';
export const SUPPORT_WHATSAPP_URL_KEY = 'support.whatsapp_url';

/** Long enough for a `wa.me` link carrying a prefilled message, short enough to stay a URL. */
export const SUPPORT_URL_MAX = 400;

export type SupportLinks = {
  /** `null` when the owner has not set one. Never an invented default. */
  readonly facebookUrl: string | null;
  readonly whatsappUrl: string | null;
};

const EMPTY: SupportLinks = { facebookUrl: null, whatsappUrl: null };

function asUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * One absolute https URL, or `null` for an empty field.
 *
 * Anything else is refused rather than repaired: a typo in a support link should be a refusal the owner
 * can see, not a button that silently points somewhere unexpected. `https` is required because these
 * open an external site from the shop's own chrome.
 */
export function parseSupportUrl(value: unknown, label: string): string | null {
  if (typeof value !== 'string') throw new ValidationError(`the ${label} link must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > SUPPORT_URL_MAX) {
    throw new ValidationError(`the ${label} link must be ${SUPPORT_URL_MAX} characters or fewer`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError(`the ${label} link must be a full address starting with https://`);
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError(`the ${label} link must start with https://`);
  }
  if (parsed.hostname.length === 0) {
    throw new ValidationError(`the ${label} link must name a site`);
  }
  return parsed.toString();
}

/** Reads both links. A missing row is `null`, not an empty string pretending to be an address. */
export async function loadSupportLinks(tx: Transaction): Promise<SupportLinks> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(sql`${storeSetting.key} in (${SUPPORT_FACEBOOK_URL_KEY}, ${SUPPORT_WHATSAPP_URL_KEY})`);

  if (rows.length === 0) return EMPTY;

  let facebookUrl: string | null = null;
  let whatsappUrl: string | null = null;
  for (const row of rows) {
    if (row.key === SUPPORT_FACEBOOK_URL_KEY) facebookUrl = asUrl(row.value);
    if (row.key === SUPPORT_WHATSAPP_URL_KEY) whatsappUrl = asUrl(row.value);
  }
  return { facebookUrl, whatsappUrl };
}

/**
 * Saves both links. Clearing a field removes the button; the write and its audit record share the
 * caller's transaction, so the trail can never describe a change that did not commit.
 */
export async function saveSupportLinks(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly facebookUrl: unknown; readonly whatsappUrl: unknown },
): Promise<SupportLinks> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  const next: SupportLinks = {
    facebookUrl: parseSupportUrl(input.facebookUrl, 'Facebook'),
    whatsappUrl: parseSupportUrl(input.whatsappUrl, 'WhatsApp'),
  };

  const before = await loadSupportLinks(tx);

  await tx
    .insert(storeSetting)
    .values([
      {
        key: SUPPORT_FACEBOOK_URL_KEY,
        value: next.facebookUrl ?? '',
        valueType: 'text',
        updatedByStaffId: actor.staffUserId,
      },
      {
        key: SUPPORT_WHATSAPP_URL_KEY,
        value: next.whatsappUrl ?? '',
        valueType: 'text',
        updatedByStaffId: actor.staffUserId,
      },
    ])
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
    action: 'settings.support_links_updated',
    entityType: 'store_setting',
    entityId: 1,
    before: { ...before },
    after: { ...next },
  });

  return next;
}
