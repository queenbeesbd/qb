/**
 * POST /api/admin/catalog/category - create, update or archive a category.
 *
 * Three operations share one route because they share one validation path and one permission. The
 * `operation` field selects between them; an unrecognized value is refused rather than defaulted, so a
 * typo cannot silently become an archive.
 *
 * Since Phase 36 the editors are their own routes (`/admin/categories/new`,
 * `/admin/categories/[categoryId]`) rather than a panel on the list, so this route returns the owner
 * to the record they just acted on instead of the unfiltered list. Only a notice code travels back -
 * never a submitted value, never an error message from the service.
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

/**
 * A destination this route will send the owner back to, and nothing else.
 *
 * The editor posts `returnTo` so a refused save returns to the form the owner was filling in rather
 * than to the list, where their typing would be gone. The pattern is an allowlist of the two shapes
 * this route owns, so a crafted value cannot make the redirect an open one.
 */
function safeReturn(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^\/admin\/categories(?:\/new|\/\d+)?$/.test(value) ? value : fallback;
}

function backTo(path: string, notice: string): Response {
  return redirectTo(`${path}?notice=${notice}`);
}

/**
 * The visibility switch, read so that the ticked box wins.
 *
 * The editor posts **two** entries under this name: a hidden `false` and, when the box is ticked,
 * `true`. `FormData.get()` returns the **first** entry in document order, so reading it that way made
 * the hidden `false` decide every save: the owner could hide a category and never show it again, and
 * the panel answered "updated". Reading the whole list fixes the direction the pair was designed for -
 * "nothing" still means off, and an explicit `true` overrides it - while an absent field stays
 * `undefined`, which is what lets the service keep its own default.
 *
 * Measured before the fix, with the exact entries a ticked box sends
 * (`["false","true"]`): stored `false`. After: stored `true`.
 */
function readVisibility(form: FormData): boolean | undefined {
  const values = form.getAll('isVisible');
  if (values.length === 0) return undefined;
  return values.includes('true');
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.catalogWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo(CATEGORIES_PATH, 'denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const target = safeReturn(form.get('returnTo'), CATEGORIES_PATH);

  const rawOperation = form.get('operation');
  const operation = typeof rawOperation === 'string' ? rawOperation : '';
  if (!(OPERATIONS as readonly string[]).includes(operation)) {
    return backTo(target, 'invalid');
  }

  const input = {
    slug: form.get('slug') ?? undefined,
    nameBn: form.get('nameBn'),
    nameEn: form.get('nameEn'),
    descriptionBn: form.get('descriptionBn') ?? undefined,
    descriptionEn: form.get('descriptionEn') ?? undefined,
    sortOrder: form.get('sortOrder') ?? undefined,
    isVisible: readVisibility(form),
  };

  try {
    if (operation === 'create') {
      const created = await withTransaction((tx) => createCategory(tx, actor, input));
      // Straight to the new record: a category with no products has nothing else to show, and the
      // owner's next act is usually assigning one or adding the description they skipped.
      return backTo(`${CATEGORIES_PATH}/${created.categoryId}`, 'created');
    }

    if (operation === 'update') {
      await withTransaction((tx) => updateCategory(tx, actor, form.get('categoryId'), input));
      return backTo(target, 'updated');
    }

    await withTransaction((tx) => archiveCategory(tx, actor, form.get('categoryId')));
    // Archive ends the record: the list is the only place left to be.
    return backTo(CATEGORIES_PATH, 'archived');
  } catch (error) {
    if (error instanceof ValidationError) return backTo(target, 'invalid');
    if (error instanceof ConflictError) return backTo(target, 'conflict');
    if (error instanceof AuthorizationError) return backTo(target, 'denied');
    throw error;
  }
}
