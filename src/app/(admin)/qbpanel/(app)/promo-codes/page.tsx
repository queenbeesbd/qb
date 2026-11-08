import { withTransaction } from '@/db/client';
import { requestNowIso } from '@/lib/clock';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { listPromoCodes } from '@/server/promotions/service';
import { PromoCodesView, type PromoNotice } from './PromoCodesView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly PromoNotice[] = [
  'created',
  'saved',
  'activated',
  'paused',
  'denied',
  'conflict',
  'invalid',
  'missing',
];

function readNotice(value: string | string[] | undefined): PromoNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as PromoNotice)
    : null;
}

/**
 * Commerce -> Promo codes.
 *
 * Requires `settings.write`: a code is a money policy, and the same permission already governs the
 * delivery charges that set what a customer is asked to pay. The list is derived - uses and the money
 * given away are counted from the redemption rows on every read, never from a counter on the code.
 */
export default async function PromoCodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const params = await searchParams;
  const codes = await withTransaction((tx) => listPromoCodes(tx));

  return (
    <PromoCodesView
      codes={codes.map((code) => ({
        id: code.id,
        code: code.code,
        description: code.description,
        kind: code.kind,
        percentOff: code.percentOff,
        amountOffMinor: code.amountOffMinor,
        minOrderMinor: code.minOrderMinor,
        maxDiscountMinor: code.maxDiscountMinor,
        startsAt: code.startsAt === null ? null : code.startsAt.toISOString(),
        endsAt: code.endsAt === null ? null : code.endsAt.toISOString(),
        maxRedemptions: code.maxRedemptions,
        isActive: code.isActive,
        redemptions: code.redemptions,
        discountGivenMinor: code.discountGivenMinor,
      }))}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      nowIso={requestNowIso()}
    />
  );
}
