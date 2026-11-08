import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadSteadfastSettings, publicStatus } from '@/server/integrations/steadfast';
import { SteadfastSettingsView, type SteadfastNotice } from './SteadfastSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly SteadfastNotice[] = [
  'saved',
  'cleared',
  'tested',
  'testFailed',
  'notConfigured',
  'denied',
  'invalid',
];

function readNotice(value: string | string[] | undefined): SteadfastNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as SteadfastNotice)
    : null;
}

/**
 * SteadFast Courier account.
 *
 * Requires `settings.write`: a courier account lets a parcel be committed, and its keys are as
 * powerful as the shop's own order screen. The page reads **only** the shape of the saved account -
 * whether each key exists and its last four characters - so nothing on this screen can leak one.
 */
export default async function SteadfastSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const settings = await withTransaction((tx) => loadSteadfastSettings(tx));
  const status = publicStatus(settings);

  return (
    <SteadfastSettingsView
      configured={status.configured}
      enabled={status.enabled}
      apiKeyHint={status.apiKeyHint}
      secretKeyHint={status.secretKeyHint}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
