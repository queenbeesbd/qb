/**
 * POST /api/admin/promo-codes - create, edit, or switch a promotion code on and off.
 *
 * One endpoint for three operations because they share one permission and one form vocabulary, and
 * because a notice code on the redirect is the only thing that travels back: never a submitted amount,
 * never a code string, never an error message from the service.
 *
 * The service re-checks `settings.write` and validates every field - the route's job is the session,
 * CSRF, origin, the operation name and the redirect.
 */

import { withTransaction } from '@/db/client';
import { PROMO_CODES_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes } from '@/server/authz/principal';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import {
  createPromoCode,
  setPromoCodeActive,
  updatePromoCode,
  type PromoInput,
} from '@/server/promotions/service';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['create', 'update', 'setActive'] as const;

/** A destination this route will send the owner back to, and nothing else. */
function safeReturn(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^\/admin\/promo-codes(?:\/\d+)?$/.test(value) ? value : fallback;
}

function backTo(path: string, notice: string): Response {
  return redirectTo(`${path}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo(PROMO_CODES_PATH, 'denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const operation = typeof form.get('operation') === 'string' ? form.get('operation') : '';
  if (!(OPERATIONS as readonly string[]).includes(String(operation))) {
    return backTo(PROMO_CODES_PATH, 'invalid');
  }

  const target = safeReturn(form.get('returnTo'), PROMO_CODES_PATH);

  const input: PromoInput = {
    code: form.get('code'),
    description: form.get('description'),
    kind: form.get('kind'),
    percentOff: form.get('percentOff'),
    amountOff: form.get('amountOff'),
    minOrder: form.get('minOrder'),
    maxDiscount: form.get('maxDiscount'),
    startsAt: form.get('startsAt'),
    endsAt: form.get('endsAt'),
    maxRedemptions: form.get('maxRedemptions'),
  };

  const rawId = form.get('id');
  const id = typeof rawId === 'string' ? Number.parseInt(rawId, 10) : Number.NaN;

  try {
    if (operation === 'create') {
      const created = await withTransaction((tx) => createPromoCode(tx, actor, input));
      return backTo(`${PROMO_CODES_PATH}/${created}`, 'created');
    }

    if (!Number.isSafeInteger(id) || id <= 0) return backTo(PROMO_CODES_PATH, 'missing');

    if (operation === 'update') {
      await withTransaction((tx) => updatePromoCode(tx, actor, id, input));
      return backTo(`${PROMO_CODES_PATH}/${id}`, 'saved');
    }

    const activate = form.get('active') === 'true';
    await withTransaction((tx) => setPromoCodeActive(tx, actor, id, activate));
    return backTo(target, activate ? 'activated' : 'paused');
  } catch (error) {
    if (error instanceof ValidationError) return backTo(target, 'invalid');
    if (error instanceof ConflictError) return backTo(target, 'conflict');
    if (error instanceof AuthorizationError) return backTo(target, 'denied');
    throw error;
  }
}
