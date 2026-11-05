/**
 * POST /api/admin/hero - manage the homepage hero carousel.
 *
 * Four operations share one permission, one validation path and one destination: add an image from the
 * shop's hero library, correct its description, remove it, or save the owner's order. The route checks
 * the session, CSRF, origin and `settings.write`; the service re-checks the permission, takes its
 * transaction lock and enforces the 1..10 bound.
 *
 * A redirect carries only a fixed notice code - never a submitted description, key or id.
 */

import { withTransaction } from '@/db/client';
import { HERO_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import {
  addHeroImage,
  removeHeroImage,
  reorderHeroImages,
  updateHeroImage,
} from '@/server/settings/hero';
import { saveUpload } from '@/server/catalog/uploads';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['add', 'upload', 'update', 'remove', 'reorder'] as const;

function backTo(notice: string): Response {
  return redirectTo(`${HERO_SETTINGS_PATH}?notice=${notice}`);
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

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) return backTo('invalid');

  try {
    if (operation === 'add') {
      await withTransaction((tx) =>
        addHeroImage(tx, actor, { key: form.get('key'), alt: form.get('alt') }),
      );
      return backTo('added');
    }

    if (operation === 'upload') {
      let asset: Awaited<ReturnType<typeof saveUpload>> | undefined;
      try {
        asset = await saveUpload(form.get('file'), 'hero');
      } catch {
        return backTo('invalid');
      }
      await withTransaction((tx) =>
        addHeroImage(tx, actor, { key: asset.key, alt: form.get('alt'), asset }),
      );
      return backTo('added');
    }

    if (operation === 'update') {
      await withTransaction((tx) =>
        updateHeroImage(tx, actor, { id: form.get('imageId'), alt: form.get('alt') }),
      );
      return backTo('updated');
    }

    if (operation === 'reorder') {
      await withTransaction((tx) => reorderHeroImages(tx, actor, form.getAll('imageId')));
      return backTo('reordered');
    }

    await withTransaction((tx) => removeHeroImage(tx, actor, form.get('imageId')));
    return backTo('removed');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof ConflictError) return backTo('conflict');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
