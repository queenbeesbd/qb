/**
 * POST /api/admin/settings/offer-popup - save the site-open offer popup.
 *
 * One destination, one form: the image, its description and the owner's switch. The upload is decoded
 * and written before the transaction by `saveOfferPopupUpload`, which also decides the square/16:9
 * frame from the bytes; the row and its audit record then save together. A refusal carries only a
 * fixed notice code.
 */

import { withTransaction } from '@/db/client';
import { OFFER_POPUP_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { saveOfferPopupUpload, type OfferPopupAspect } from '@/server/catalog/uploads';
import { saveOfferPopup } from '@/server/settings/offer-popup';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

function backTo(notice: string): Response {
  return redirectTo(`${OFFER_POPUP_SETTINGS_PATH}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo('denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const file = form.get('image');
  let asset: { key: string; aspect: OfferPopupAspect } | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      const stored = await saveOfferPopupUpload(file);
      asset = { key: stored.asset.key, aspect: stored.aspect };
    } catch {
      return backTo('imageInvalid');
    }
  }

  const isActive = form.getAll('isActive').includes('true');

  try {
    await withTransaction((tx) =>
      saveOfferPopup(tx, actor, { asset, altText: form.get('altText'), isActive }),
    );
    return backTo('saved');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof ConflictError) return backTo('conflict');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
