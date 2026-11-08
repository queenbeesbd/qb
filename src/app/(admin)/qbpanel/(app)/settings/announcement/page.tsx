import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { ANNOUNCEMENT_MAX, loadAnnouncement } from '@/server/settings/announcement';
import { AnnouncementSettingsView, type AnnouncementNotice } from './AnnouncementSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly AnnouncementNotice[] = ['saved', 'denied', 'invalid'];

function readNotice(value: string | string[] | undefined): AnnouncementNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as AnnouncementNotice)
    : null;
}

/**
 * Settings -> Announcement bar.
 *
 * Requires `settings.write`, which is owner-level in the catalogue. The page reads the current text;
 * every write goes through the guarded `/api/qbpanel/announcement` route and its service-level re-check.
 */
export default async function AnnouncementSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const announcement = await withTransaction((tx) => loadAnnouncement(tx));

  return (
    <AnnouncementSettingsView
      message={announcement.message}
      visible={announcement.visible}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      maxLength={ANNOUNCEMENT_MAX}
    />
  );
}
