import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadSupportLinks, SUPPORT_URL_MAX } from '@/server/settings/support';
import { SupportSettingsView, type SupportNotice } from './SupportSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly SupportNotice[] = ['saved', 'denied', 'invalid'];

function readNotice(value: string | string[] | undefined): SupportNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as SupportNotice)
    : null;
}

/**
 * Settings -> Support links.
 *
 * Requires `settings.write`, which is owner-level in the catalogue. The page reads the two saved
 * addresses; every write goes through the guarded `/api/admin/support-links` route and its
 * service-level re-check. An empty field means the button is not shown on the storefront at all.
 */
export default async function SupportSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const links = await withTransaction((tx) => loadSupportLinks(tx));

  return (
    <SupportSettingsView
      facebookUrl={links.facebookUrl}
      whatsappUrl={links.whatsappUrl}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      maxLength={SUPPORT_URL_MAX}
    />
  );
}
