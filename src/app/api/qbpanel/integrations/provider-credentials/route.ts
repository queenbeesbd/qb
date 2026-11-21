/**
 * POST /api/qbpanel/integrations/provider-credentials - save or remove owner-managed provider
 * credentials (ADR 0047).
 *
 * Only a fixed notice returns. A submitted secret is never reflected, logged or audited as a value;
 * the service writes it to `store_setting` and records masked shape only.
 */

import { withTransaction } from '@/db/client';
import {
  ACCOUNT_EMAIL_SETTINGS_PATH,
  SMS_VERIFICATION_SETTINGS_PATH,
  TELEGRAM_SETTINGS_PATH,
} from '@/server/auth/constants';
import { guardMutation } from '@/server/auth/guard';
import { roleCodes } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ValidationError } from '@/server/authz/authorize';
import { saveProviderCredentials, PROVIDER_KEYS } from '@/server/integrations/provider-credentials';
import { deny, redirectTo } from '../../responses';

export const dynamic = 'force-dynamic';

const SECTION_PATHS: Record<string, string> = {
  email: ACCOUNT_EMAIL_SETTINGS_PATH,
  sms: SMS_VERIFICATION_SETTINGS_PATH,
  telegram: TELEGRAM_SETTINGS_PATH,
};

function backTo(section: string, notice: string): Response {
  const path = SECTION_PATHS[section] ?? ACCOUNT_EMAIL_SETTINGS_PATH;
  return redirectTo(`${path}?notice=${notice}`);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardMutation(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) {
    if (guard.reason === 'forbidden') return backTo('email', 'denied');
    return deny(guard.status);
  }

  const { principal, form } = guard;
  const actor = {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };

  const rawSection = form.get('section');
  const section = typeof rawSection === 'string' && rawSection in SECTION_PATHS ? rawSection : 'email';
  const clear = Object.values(PROVIDER_KEYS).filter((key) => form.getAll('clear').includes(key));
  try {
    await withTransaction((tx) =>
      saveProviderCredentials(tx, actor, {
        telegramBotToken: form.get('telegramBotToken'),
        resendApiKey: form.get('resendApiKey'),
        resendFrom: form.get('resendFrom'),
        baseUrl: form.get('baseUrl'),
        smsApiKey: form.get('smsApiKey'),
        smsSenderId: form.get('smsSenderId'),
        clear,
      }),
    );
    return backTo(section, 'saved');
  } catch (error) {
    if (error instanceof ValidationError) return backTo(section, 'invalid');
    throw error;
  }
}
