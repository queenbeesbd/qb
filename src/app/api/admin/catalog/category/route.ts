/**
 * POST /api/admin/catalog/category - create, update or archive a category.
 *
 * Three operations share one route because they share one validation path and one permission. The
 * `operation` field selects between them; an unrecognized value is refused rather than defaulted, so a
 * typo cannot silently become an archive.
 *
 * Archiving is a **refusal-first** operation: a category that still has live products or subcategories is
 * not archived, and the owner is told what is in the way.
 */

import { withTransaction } from '@/db/client';
import { CATEGORIES_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import { archiveCategory, createCategory, updateCategory } from '@/server/catalog/service';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['create', 'update', 'archive'] as const;

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

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) {
    return redirectTo(`${CATEGORIES_PATH}?notice=invalid`);
  }

  try {
    if (operation === 'create') {
      await withTransaction((tx) =>
        createCategory(tx, actor, {
          slug: form.get('slug') ?? undefined,
          nameBn: form.get('nameBn'),
          nameEn: form.get('nameEn'),
          descriptionBn: form.get('descriptionBn') ?? undefined,
          descriptionEn: form.get('descriptionEn') ?? undefined,
          sortOrder: form.get('sortOrder') ?? undefined,
          isVisible: form.get('isVisible') ?? undefined,
        }),
      );
      return redirectTo(`${CATEGORIES_PATH}?notice=created`);
    }

    if (operation === 'update') {
      await withTransaction((tx) =>
        updateCategory(tx, actor, form.get('categoryId'), {
          slug: form.get('slug') ?? undefined,
          nameBn: form.get('nameBn'),
          nameEn: form.get('nameEn'),
          descriptionBn: form.get('descriptionBn') ?? undefined,
          descriptionEn: form.get('descriptionEn') ?? undefined,
          sortOrder: form.get('sortOrder') ?? undefined,
          isVisible: form.get('isVisible') ?? undefined,
        }),
      );
      return redirectTo(`${CATEGORIES_PATH}?notice=updated`);
    }

    await withTransaction((tx) => archiveCategory(tx, actor, form.get('categoryId')));
    return redirectTo(`${CATEGORIES_PATH}?notice=archived`);
  } catch (error) {
    if (error instanceof ValidationError) return redirectTo(`${CATEGORIES_PATH}?notice=invalid`);
    if (error instanceof ConflictError) return redirectTo(`${CATEGORIES_PATH}?notice=conflict`);
    if (error instanceof AuthorizationError) return redirectTo(`${CATEGORIES_PATH}?notice=denied`);
    throw error;
  }
}
