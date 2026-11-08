/**
 * POST /api/qbpanel/delivery - configure delivery charges.
 *
 * Three operations, one permission: save the required default, save (or reactivate) a district
 * override, deactivate an override. The route checks the session, CSRF and origin; the service re-checks
 * `settings.write` and validates every amount with the catalog's `parsePoisha` (zero allowed, negative,
 * malformed and formatted values refused). The change and its audit record commit together.
 *
 * A redirect carries only a fixed notice code - never a submitted amount or district.
 */

import { withTransaction } from '@/db/client';
import { DELIVERY_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@/server/authz/authorize';
import {
  deactivateDistrictDeliveryCharge,
  saveConditionalDelivery,
  saveRepeatDelivery,
  saveRepeatDiscount,
  setDefaultDeliveryCharge,
  setDistrictDeliveryCharge,
} from '@/server/delivery/service';
import { deny, redirectTo } from '../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = [
  'default',
  'saveDistrict',
  'deactivateDistrict',
  'conditional',
  'repeatDelivery',
  'repeatDiscount',
] as const;

function backTo(notice: string): Response {
  return redirectTo(`${DELIVERY_SETTINGS_PATH}?notice=${notice}`);
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
    if (operation === 'default') {
      await withTransaction((tx) => setDefaultDeliveryCharge(tx, actor, form.get('amount')));
      return backTo('defaultSaved');
    }

    if (operation === 'conditional') {
      await withTransaction((tx) =>
        saveConditionalDelivery(tx, actor, {
          enabled: form.getAll('enabled').includes('true'),
          minSubtotal: form.get('minSubtotal'),
          dhaka: form.get('dhaka'),
          chattogram: form.get('chattogram'),
          others: form.get('others'),
        }),
      );
      return backTo('conditionalSaved');
    }

    if (operation === 'repeatDelivery') {
      await withTransaction((tx) =>
        saveRepeatDelivery(tx, actor, {
          enabled: form.getAll('enabled').includes('true'),
          chattogram: form.get('chattogram'),
          others: form.get('others'),
        }),
      );
      return backTo('repeatDeliverySaved');
    }

    if (operation === 'repeatDiscount') {
      await withTransaction((tx) =>
        saveRepeatDiscount(tx, actor, {
          enabled: form.getAll('enabled').includes('true'),
          percent: form.get('percent'),
          minSubtotal: form.get('minSubtotal'),
        }),
      );
      return backTo('repeatDiscountSaved');
    }

    if (operation === 'saveDistrict') {
      await withTransaction((tx) =>
        setDistrictDeliveryCharge(tx, actor, {
          districtCode: form.get('districtCode'),
          amount: form.get('amount'),
        }),
      );
      return backTo('districtSaved');
    }

    await withTransaction((tx) =>
      deactivateDistrictDeliveryCharge(tx, actor, form.get('districtCode')),
    );
    return backTo('districtDeactivated');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof ConflictError) return backTo('conflict');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
