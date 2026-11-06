import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import {
  loadOfferPopup,
  OFFER_POPUP_ALT_MAX,
  type OfferPopupRow,
} from '@/server/settings/offer-popup';
import { OfferPopupSettingsView, type OfferPopupNotice } from './OfferPopupSettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly OfferPopupNotice[] = ['saved', 'imageInvalid', 'invalid', 'conflict', 'denied'];

function readNotice(value: string | string[] | undefined): OfferPopupNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as OfferPopupNotice)
    : null;
}

/**
 * Settings -> Offer popup.
 *
 * Requires `settings.write`. One image and one switch, stored in the `offer_popup` singleton; the
 * storefront layout reads the active row and renders it once per browsing session. The page never
 * invents an offer - it shows exactly the saved image and description.
 */
export default async function OfferPopupSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const current: OfferPopupRow | null = await withTransaction((tx) => loadOfferPopup(tx));

  return (
    <OfferPopupSettingsView
      current={
        current === null
          ? null
          : {
              imageKey: current.imageKey,
              aspect: current.aspect,
              altText: current.altText,
              isActive: current.isActive,
            }
      }
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      altMax={OFFER_POPUP_ALT_MAX}
    />
  );
}
