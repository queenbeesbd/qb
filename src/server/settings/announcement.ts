/**
 * The storefront announcement bar's owner-editable text (Phase 28).
 *
 * Stored in the existing `store_setting` key/value table, so this needed **no schema change and no
 * migration**: that table was designed for exactly this, with a key-format check, a typed value and
 * an audit-friendly `updated_by_staff_id`.
 *
 * The **locked demo notice is not stored here**. It stays in `src/data/announcements.ts` and always
 * renders, because the preview store must never be able to present itself as a live ordering channel.
 * This is only the "news" line the owner writes beneath it.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { storeSetting } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';

export const ANNOUNCEMENT_MESSAGE_KEY = 'announcement.message';
export const ANNOUNCEMENT_VISIBLE_KEY = 'announcement.visible';

/** Matches the textarea's `maxLength` and the validation below, so the two cannot disagree. */
export const ANNOUNCEMENT_MAX = 300;

export type AnnouncementSetting = {
  /** `null` when the owner has never written one. Never an invented default. */
  readonly message: string | null;
  readonly visible: boolean;
};

const EMPTY: AnnouncementSetting = { message: null, visible: false };

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Reads the current announcement. A missing row is `null`, not an empty string pretending to be copy. */
export async function loadAnnouncement(tx: Transaction): Promise<AnnouncementSetting> {
  const rows = await tx
    .select({ key: storeSetting.key, value: storeSetting.value })
    .from(storeSetting)
    .where(sql`${storeSetting.key} in (${ANNOUNCEMENT_MESSAGE_KEY}, ${ANNOUNCEMENT_VISIBLE_KEY})`);

  if (rows.length === 0) return EMPTY;

  let message: string | null = null;
  let visible = false;
  for (const row of rows) {
    if (row.key === ANNOUNCEMENT_MESSAGE_KEY) message = asText(row.value);
    if (row.key === ANNOUNCEMENT_VISIBLE_KEY) visible = row.value === true;
  }
  return { message, visible };
}

/**
 * Saves the owner's message and its visibility.
 *
 * An empty message is stored as empty and forced hidden: "nothing to say" must not leave a bar with a
 * blank line in it. The write and its audit record share the caller's transaction, so the trail can
 * never describe a change that did not commit.
 */
export async function saveAnnouncement(
  tx: Transaction,
  actor: ActorContext,
  input: { readonly message: unknown; readonly visible: unknown },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'store_setting', 1);

  if (typeof input.message !== 'string') {
    throw new ValidationError('announcement text must be a string');
  }
  const message = input.message.trim();
  if (message.length > ANNOUNCEMENT_MAX) {
    throw new ValidationError(`announcement text must be ${ANNOUNCEMENT_MAX} characters or fewer`);
  }
  const visible = input.visible === true || input.visible === 'on' || input.visible === 'true';

  const before = await loadAnnouncement(tx);
  const next: AnnouncementSetting = { message: message.length === 0 ? null : message, visible };

  await tx
    .insert(storeSetting)
    .values([
      {
        key: ANNOUNCEMENT_MESSAGE_KEY,
        value: next.message ?? '',
        valueType: 'text',
        updatedByStaffId: actor.staffUserId,
      },
      {
        key: ANNOUNCEMENT_VISIBLE_KEY,
        value: next.visible,
        valueType: 'boolean',
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
    action: 'settings.announcement_updated',
    entityType: 'store_setting',
    entityId: 1,
    before: { message: before.message, visible: before.visible },
    after: { message: next.message, visible: next.visible },
  });
}
