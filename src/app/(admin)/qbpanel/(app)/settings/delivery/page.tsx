import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { loadDeliveryOverview, loadDeliveryRates } from '@/server/delivery/service';
import { DeliverySettingsView, type DeliveryNotice } from './DeliverySettingsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly DeliveryNotice[] = [
  'defaultSaved',
  'districtSaved',
  'districtDeactivated',
  'conditionalSaved',
  'repeatDeliverySaved',
  'repeatDiscountSaved',
  'denied',
  'conflict',
  'invalid',
];

function readNotice(value: string | string[] | undefined): DeliveryNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as DeliveryNotice)
    : null;
}

/**
 * Settings -> Delivery charges.
 *
 * Requires `settings.write`, which is owner-level in the catalogue. The page reads configuration only;
 * every write goes through the guarded `/api/qbpanel/delivery` route and its service-level re-check.
 */
export default async function DeliverySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const { overview, rates } = await withTransaction(async (tx) => ({
    overview: await loadDeliveryOverview(tx),
    rates: await loadDeliveryRates(tx),
  }));

  return (
    <DeliverySettingsView
      defaultMinor={overview.defaultMinor}
      overrides={overview.overrides.map((row) => ({
        id: row.id,
        districtCode: row.districtCode,
        amountMinor: row.amountMinor,
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
      }))}
      pricing={{
        conditional: rates.conditional ?? {
          enabled: false,
          minSubtotalMinor: null,
          dhakaMinor: null,
          chattogramMinor: null,
          othersMinor: null,
        },
        repeat: rates.repeat ?? { enabled: false, chattogramMinor: null, othersMinor: null },
        repeatDiscount: rates.repeatDiscount ?? {
          enabled: false,
          percent: null,
          minSubtotalMinor: null,
        },
      }}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
