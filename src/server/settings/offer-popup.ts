/**
 * The site-open offer popup - one image, one switch.
 *
 * A single shop has **one** offer popup at a time, so this is a singleton row (`id = 1`), not a
 * campaign list. Changing the offer replaces the image and the audit trail keeps the history; the
 * owner never has to clean up old rows. The image is an asset key written by `saveOfferPopupUpload`
 * (square or 16:9 frame), and the frame is stored beside it so the storefront derives the right path.
 *
 * Every write re-checks `settings.write` here, and the service refuses to create a row without an
 * image: a popup with no picture would be an active offer the shopper cannot see.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { offerPopup } from '@/db/schema';
import { PERMISSIONS } from '@/server/authz/permissions';
import { requirePermission, ValidationError, type ActorContext } from '@/server/authz/authorize';
import { recordAudit } from '@/server/auth/audit';
import type { OfferPopupAspect } from '@/server/catalog/uploads';

/** Matches the description input's `maxLength` and the database CHECK. */
export const OFFER_POPUP_ALT_MAX = 200;

export type OfferPopupRow = {
  readonly imageKey: string;
  readonly aspect: OfferPopupAspect;
  /** `null` when the owner wrote none; the dialog then uses its generic "Offer" label. */
  readonly altText: string | null;
  readonly isActive: boolean;
  readonly updatedAt: Date;
};

/**
 * The description is **optional** (owner direction, 2026-11-10): blank stores `null` rather than
 * blocking the save, and the storefront falls back to a generic dialog label instead of inventing a
 * description of the picture. A supplied description is still bounded, because it is read aloud.
 */
function parseAltText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError('the description must be text');
  const text = value.trim();
  if (text.length > OFFER_POPUP_ALT_MAX) {
    throw new ValidationError(`the description must be ${OFFER_POPUP_ALT_MAX} characters or fewer`);
  }
  return text.length === 0 ? null : text;
}

function parseAspect(value: unknown): OfferPopupAspect {
  if (value === 'square' || value === 'wide') return value;
  throw new ValidationError('the popup image frame is not supported');
}

/** The singleton row, or null when the owner has never saved one. */
export async function loadOfferPopup(tx: Transaction): Promise<OfferPopupRow | null> {
  const rows = await tx
    .select({
      imageKey: offerPopup.imageKey,
      aspect: offerPopup.aspect,
      altText: offerPopup.altText,
      isActive: offerPopup.isActive,
      updatedAt: offerPopup.updatedAt,
    })
    .from(offerPopup)
    .where(sql`${offerPopup.id} = 1`);

  const row = rows[0];
  if (row === undefined) return null;
  return { ...row, aspect: parseAspect(row.aspect) };
}

/** The row the storefront may render: present **and switched on**. */
export async function loadActiveOfferPopup(tx: Transaction): Promise<OfferPopupRow | null> {
  const row = await loadOfferPopup(tx);
  return row !== null && row.isActive ? row : null;
}

/**
 * Saves the singleton. A new upload supplies both the key and the frame its bytes were encoded in;
 * an edit with no new file keeps the stored image and changes only the description and the switch.
 */
export async function saveOfferPopup(
  tx: Transaction,
  actor: ActorContext,
  input: {
    readonly asset?: { readonly key: string; readonly aspect: OfferPopupAspect } | null;
    readonly altText: unknown;
    readonly isActive: unknown;
  },
): Promise<void> {
  await requirePermission(actor, PERMISSIONS.settingsWrite, 'offer_popup', 1);

  const altText = parseAltText(input.altText);
  if (typeof input.isActive !== 'boolean') throw new ValidationError('choose whether the popup is shown');

  const before = await loadOfferPopup(tx);

  let imageKey: string;
  let aspect: OfferPopupAspect;
  if (input.asset !== undefined && input.asset !== null) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.asset.key)) {
      throw new ValidationError('the uploaded image key is not usable');
    }
    imageKey = input.asset.key;
    aspect = parseAspect(input.asset.aspect);
  } else if (before !== null) {
    imageKey = before.imageKey;
    aspect = before.aspect;
  } else {
    throw new ValidationError('upload an image before saving the popup');
  }

  if (before === null) {
    await tx.insert(offerPopup).values({ id: 1, imageKey, aspect, altText, isActive: input.isActive });
  } else {
    await tx
      .update(offerPopup)
      .set({ imageKey, aspect, altText, isActive: input.isActive, updatedAt: sql`now()` })
      .where(sql`${offerPopup.id} = 1`);
  }

  await recordAudit(tx, {
    actorType: 'staff',
    actorStaffId: actor.staffUserId,
    actorRoleCodes: actor.roleCodes,
    action: 'settings.offer_popup_saved',
    entityType: 'offer_popup',
    entityId: 1,
    before:
      before === null
        ? undefined
        : {
            imageKey: before.imageKey,
            aspect: before.aspect,
            altText: before.altText,
            isActive: before.isActive,
          },
    after: { imageKey, aspect, altText, isActive: input.isActive },
  });
}
