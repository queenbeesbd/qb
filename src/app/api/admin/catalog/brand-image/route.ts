/**
 * POST /api/admin/catalog/brand-image - set or clear a brand's logo.
 *
 * Two operations share this route because they share one permission, one validation path and one
 * place to return to:
 *
 * | `operation` | Field | Result |
 * | --- | --- | --- |
 * | `choose` | `imageKey` (an existing asset) | Associates that asset with the brand |
 * | `clear` | - | Removes the association; the storefront draws the brand's initials |
 *
 * **Why an upload is not here.** The image has to exist as a generated, validated asset before a
 * brand can point at it, and every asset the shop owns was written by the asset pipeline
 * (`npm run assets:discovery`), not by a request handler: a browser upload would have to be accepted,
 * decoded, re-encoded, written at two widths and - in a deployment - pushed to object storage (ADR
 * 0006) inside one POST. Neither the runtime image library nor object storage is approved, so the
 * editor lists the assets the shop actually has and the owner picks one.
 *
 * The key is validated by the service against the server's own inventory - format, then the
 * allowlist, then the file - so a request cannot name a path, a URL or an object that is not a
 * complete image.
 */

import { withTransaction } from '@/db/client';
import { BRANDS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { setBrandImage } from '@/server/catalog/service';
import { saveUpload } from '@/server/catalog/uploads';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['choose', 'upload', 'clear'] as const;

/**
 * Where a refusal returns: the brand logo editor that produced it, and nothing else.
 *
 * The pattern is an allowlist of that editor's own shape, so a crafted `returnTo` cannot make this an
 * open redirect. With no usable id there is no editor to return to, and the brand list is the honest
 * destination.
 */
function safeReturn(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') return BRANDS_PATH;
  return /^\/admin\/catalog\/brands\/\d+$/.test(value) ? value : BRANDS_PATH;
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return redirectTo(`${BRANDS_PATH}?notice=denied`);
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
      setBrandImage(tx, actor, {
        brandId: form.get('brandId'),
        imageKey: operation === 'clear' ? '' : operation === 'upload' ? asset?.key : form.get('imageKey'),
        asset,
      }),
    );
    return back(operation === 'clear' ? 'imageRemoved' : 'imageUpdated');
  } catch (error) {
    if (error instanceof ValidationError) return back('imageInvalid');
    /*
     * A conflict means the brand is gone, so returning to its editor would land on a 404 - a refusal
     * that reads as broken. The list is where the owner can see which brands still exist.
     */
    if (error instanceof ConflictError) return redirectTo(`${BRANDS_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return back('denied');
    throw error;
  }
}
