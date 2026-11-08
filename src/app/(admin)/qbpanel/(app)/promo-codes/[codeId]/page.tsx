import { notFound } from 'next/navigation';

import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { getPromoCode } from '@/server/promotions/service';
import { PromoCodeForm } from '../PromoCodeForm';
import { takaInput, type PromoFormValues } from '../promo-form-values';
import type { PromoNotice } from '../PromoCodesView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly PromoNotice[] = ['saved', 'activated', 'paused', 'denied', 'conflict', 'invalid', 'created'];

function readNotice(value: string | string[] | undefined): PromoNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate !== undefined && (NOTICES as readonly string[]).includes(candidate)
    ? (candidate as PromoNotice)
    : null;
}

/**
 * A date input value in the server's own day.
 *
 * `ends_at` is stored as the midnight *after* the last usable day, so it is shown one day earlier -
 * the field must read back what the owner typed, not the exclusive bound the evaluator compares.
 */
function dayInput(date: Date | null, shiftDays = 0): string {
  if (date === null) return '';
  const shifted = new Date(date.getTime() + shiftDays * 24 * 60 * 60 * 1000);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Edit one promo code.
 *
 * The statistics are read, not stored: uses and the money given away are the redemption rows, so this
 * screen cannot drift from the orders that carry the code.
 */
export default async function EditPromoCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ codeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.settingsWrite);
  const { codeId } = await params;
  const id = Number.parseInt(codeId, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const code = await withTransaction((tx) => getPromoCode(tx, id));
  if (code === null) notFound();

  const paramsValue = await searchParams;
  const initial: PromoFormValues = {
    code: code.code,
    description: code.description ?? '',
    kind: code.kind,
    percentOff: code.percentOff === null ? '' : String(code.percentOff),
    amountOff: takaInput(code.amountOffMinor),
    minOrder: takaInput(code.minOrderMinor),
    maxDiscount: takaInput(code.maxDiscountMinor),
    startsAt: dayInput(code.startsAt),
    endsAt: dayInput(code.endsAt, -1),
    maxRedemptions: code.maxRedemptions === null ? '' : String(code.maxRedemptions),
  };

  return (
    <PromoCodeForm
      mode="edit"
      id={code.id}
      initial={initial}
      stats={{
        isActive: code.isActive,
        redemptions: code.redemptions,
        discountGivenMinor: code.discountGivenMinor,
        createdAt: code.createdAt.toISOString(),
      }}
      notice={readNotice(paramsValue.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
