/**
 * POST /api/admin/catalog/category-image - set, replace or clear a category's square photograph.
 *
 * Two operations share this route because they share one permission, one validation path and one
 * place to return to:
 *
 * | `operation` | Field | Result |
 * | --- | --- | --- |
 * | `choose` | `imageKey` (an existing asset) | Associates that asset with the category |
 * | `clear` | - | Removes the association; the tile falls back to its icon |
 *
 * **Why an upload is not here.** The image has to exist as a generated, validated asset before a
 * category can point at it, and that happens in the asset pipeline (`npm run assets:discovery`) rather
 * than in a request handler: a browser upload would have to be accepted, re-encoded, written twice at
 * two sizes and pushed to object storage inside one POST, which is a file-processing service, not a
 * form handler. The editor therefore lists the assets the shop actually owns and the owner picks one.
 * `docs/catalog.md` states this gap rather than implying an upload that does not exist.
 *
 * The key is validated by the service against the server's own inventory - format, then the allowlist,
 * then the file - so a request cannot name a path, a URL or an object that is not a complete image.
 */

import { withTransaction } from '@/db/client';
import { CATEGORIES_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { setCategoryImage } from '@/server/catalog/service';
import { saveUpload } from '@/server/catalog/uploads';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['choose', 'upload', 'clear'] as const;

/**
 * Where a refusal returns: the category editor that produced it, and nothing else.
 *
 * The pattern is an allowlist of the editor's own shape, so a crafted `returnTo` cannot make this an
 * open redirect. With no usable id there is no editor to return to, and the list is the honest
 * destination.
 */
function safeReturn(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return CATEGORIES_PATH;
  return /^\/admin\/categories\/\d+$/.test(value) ? value : CATEGORIES_PATH;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${CATEGORIES_PATH}?notice=denied`);
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const target = safeReturn(form.get('returnTo'));
  const back = (notice: string): Response => redirectTo(`${target}?notice=${notice}`);

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) return back('invalid');

  try {
    let asset: Awaited<ReturnType<typeof saveUpload>> | undefined;
    if (operation === 'upload') {
      try {
        asset = await saveUpload(form.get('file'), 'square');
      } catch {
        return back('imageInvalid');
      }
    }

    await withTransaction((tx) =>
      setCategoryImage(tx, actor, {
        categoryId: form.get('categoryId'),
        imageKey: operation === 'clear' ? '' : operation === 'upload' ? asset?.key : form.get('imageKey'),
        asset,
      }),
    );
    return back(operation === 'clear' ? 'imageRemoved' : 'imageUpdated');
  } catch (error) {
    if (error instanceof ValidationError) return back('imageInvalid');
    if (error instanceof ConflictError) return back('conflict');
    if (error instanceof AuthorizationError) return back('denied');
    throw error;
  }
}
