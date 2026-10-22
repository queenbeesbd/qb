import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadCheckoutSettings } from '@/server/settings/checkout';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { OtherSettingsView } from './OtherSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES = ['saved', 'denied'] as const;
type OtherSettingsNotice = (typeof NOTICES)[number];

function readNotice(value: string | string[] | undefined): OtherSettingsNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as OtherSettingsNotice)
    : null;
}

/**
 * Other settings.
 *
 * A home for store policy that is not a value the storefront renders: today, who may place an order.
 * It is deliberately separate from Delivery charges and the Announcement bar, which are both about
 * what a customer sees, and it is where a future checkout policy belongs rather than being scattered
 * across the panel.
 */
export default async function OtherSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const settings = await withTransaction((tx) => loadCheckoutSettings(tx));
  const notice = readNotice(params.notice);

  return (
    <>
      <PageHeader
        title={translate('admin.settings.other.title')}
        description={translate('admin.settings.other.body')}
      />

      {notice !== null && (
        <Notice tone={notice === 'saved' ? 'success' : 'error'}>
          {translate(notice === 'saved' ? 'admin.settings.other.notice.saved' : 'admin.settings.other.notice.denied')}
        </Notice>
      )}

      <OtherSettingsView guestOrders={settings.guestOrders} csrfToken={principal.csrfToken} />
    </>
  );
}
