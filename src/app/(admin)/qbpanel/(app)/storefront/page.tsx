import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import {
  STOREFRONT_BRAND_LIMIT,
  STOREFRONT_CATEGORY_LIMIT,
  STOREFRONT_OFFER_LIMIT,
  loadStorefrontCandidates,
  loadStorefrontSelection,
} from '@/server/storefront/selection';
import { StorefrontView, type StorefrontNotice } from './StorefrontView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly StorefrontNotice[] = ['saved', 'cleared', 'denied', 'invalid', 'conflict'];

function readNotice(value: string | string[] | undefined): StorefrontNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as StorefrontNotice)
    : null;
}

/**
 * Storefront -> Customisation.
 *
 * The three homepage rows the owner can decide, in one screen: which departments the "Shop By Category"
 * rail draws, which brands the "Shop By Brand" rail draws, and which products the "On Offer" row holds.
 * Each is an ordered selection with a stated cap; an empty selection keeps the shop's automatic choice,
 * which the page says in words rather than leaving the owner guessing what a blank means.
 *
 * Requires `settings.write` (owner-level), like every other setting that changes what a customer sees.
 * Every write goes through `/api/qbpanel/storefront` and the service re-checks the permission, the caps
 * and that each pick is something the shop can still show, so hiding a control here is never the control.
 */
export default async function StorefrontSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;

  const { candidates, selection } = await withTransaction(async (tx) => {
    const [candidates, selection] = await Promise.all([
      loadStorefrontCandidates(tx),
      loadStorefrontSelection(tx),
    ]);
    return { candidates, selection };
  });

  return (
    <StorefrontView
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      candidates={candidates}
      selected={{
        categories: selection.categories.map((row) => row.id),
        brands: selection.brands.map((row) => row.id),
        offers: selection.offers.map((row) => row.id),
      }}
      limits={{
        categories: STOREFRONT_CATEGORY_LIMIT,
        brands: STOREFRONT_BRAND_LIMIT,
        offers: STOREFRONT_OFFER_LIMIT,
      }}
    />
  );
}
