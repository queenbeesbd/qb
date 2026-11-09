import { withTransaction } from '@/db/client';
import { translate } from '@/i18n/config';
import type { TranslationKey } from '@/i18n/dictionaries';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadCheckoutSettings } from '@/server/settings/checkout';
import { loadPaymentInstructions, PAYMENT_MAX } from '@/server/settings/payment';
import { Notice } from '../../../_ui/Notice';
import { PageHeader } from '../../../_ui/PageHeader';
import { OtherSettingsView } from './OtherSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES = ['saved', 'paymentSaved', 'denied', 'invalid'] as const;
type OtherSettingsNotice = (typeof NOTICES)[number];

const NOTICE_KEYS: Record<OtherSettingsNotice, TranslationKey> = {
  saved: 'admin.settings.other.notice.saved',
  paymentSaved: 'admin.settings.other.notice.paymentSaved',
  denied: 'admin.settings.other.notice.denied',
  invalid: 'admin.settings.other.notice.invalid',
};

const ERROR_NOTICES: readonly OtherSettingsNotice[] = ['denied', 'invalid'];

function readNotice(value: string | string[] | undefined): OtherSettingsNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as OtherSettingsNotice)
    : null;
}

/**
 * Other settings.
 *
 * A home for checkout policy that is not a value the storefront renders elsewhere: who may place an
 * order, and the **Checkout instructions** the payment card publishes. It is deliberately separate
 * from Delivery charges and the Announcement bar, which are both about what a customer sees on the
 * storefront, and it is where a future checkout policy belongs rather than being scattered across the
 * panel.
 */
export default async function OtherSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const { settings, payment } = await withTransaction(async (tx) => ({
    settings: await loadCheckoutSettings(tx),
    payment: await loadPaymentInstructions(tx),
  }));
  const notice = readNotice(params.notice);

  return (
    <>
      <PageHeader
        title={translate('admin.settings.other.title')}
        description={translate('admin.settings.other.body')}
      />

      {notice !== null && (
        <Notice tone={ERROR_NOTICES.includes(notice) ? 'error' : 'success'}>
          {translate(NOTICE_KEYS[notice])}
        </Notice>
      )}

      <OtherSettingsView
        guestOrders={settings.guestOrders}
        payment={payment}
        paymentMaxLengths={PAYMENT_MAX}
        csrfToken={principal.csrfToken}
      />
    </>
  );
}
