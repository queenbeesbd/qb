/**
 * POST /api/admin/integrations/steadfast - save the courier account, remove it, or ask SteadFast
 * whether the saved keys work.
 *
 * Only a **notice code** travels back on the redirect. The API key and secret key never travel back to
 * the browser in any form: the page reads `••••` plus the last four characters, and this route never
 * reflects what was submitted.
 *
 * `test` deliberately uses the **saved** keys rather than the ones typed into the form. Testing an
 * unsaved value would mean the screen could say "works" about a credential the shop is not storing;
 * save first, then test, is one extra step and an honest answer.
 */

import { withTransaction } from '@/db/client';
import { STEADFAST_SETTINGS_PATH } from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { AuthorizationError, ValidationError } from '@/server/authz/authorize';
import {
  clearSteadfastCredentials,
  credentialsOf,
  getBalance,
  loadSteadfastSettings,
  saveSteadfastSettings,
} from '@/server/integrations/steadfast';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const OPERATIONS = ['save', 'clear', 'test'] as const;

function backTo(notice: string): Response {
  return redirectTo(`${STEADFAST_SETTINGS_PATH}?notice=${notice}`);
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
    if (operation === 'save') {
      // A ticked box posts `true`; an unticked one posts nothing, so the whole value list is read and
      // any explicit `true` wins. No hidden companion shares the field's name.
      const enabled = form.getAll('enabled').includes('true');
      await withTransaction((tx) =>
        saveSteadfastSettings(tx, actor, {
          apiKey: form.get('apiKey'),
          secretKey: form.get('secretKey'),
          enabled,
        }),
      );
      return backTo('saved');
    }

    if (operation === 'clear') {
      await withTransaction((tx) => clearSteadfastCredentials(tx, actor));
      return backTo('cleared');
    }

    const settings = await withTransaction((tx) => loadSteadfastSettings(tx));
    const credentials = credentialsOf(settings);
    if (credentials === null) return backTo('notConfigured');

    const result = await getBalance(credentials);
    return backTo(result.ok ? 'tested' : 'testFailed');
  } catch (error) {
    if (error instanceof ValidationError) return backTo('invalid');
    if (error instanceof AuthorizationError) return backTo('denied');
    throw error;
  }
}
