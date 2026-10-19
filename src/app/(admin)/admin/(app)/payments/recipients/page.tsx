import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { PERMISSIONS } from '@/server/authz/permissions';
import { roleCodes, type StaffPrincipal } from '@/server/authz/principal';
import { recipientConfiguration } from '@/server/payments/recipients';
import { RecipientsView, type RecipientNotice } from './RecipientsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly RecipientNotice[] = [
  'created',
  'updated',
  'replaced',
  'unchanged',
  'deactivated',
  'reactivated',
  'conflict',
  'invalid',
  'denied',
];

function readNotice(value: string | string[] | undefined): RecipientNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as RecipientNotice) : null;
}

/** The actor the service re-authorizes. Kept beside the page so the two cannot drift. */
function actorOf(principal: StaffPrincipal) {
  return {
    staffUserId: principal.staffUserId,
    permissions: principal.permissions,
    roleCodes: roleCodes(principal),
  };
}

/**
 * Payment recipients - which account receives bKash and which receives Nagad.
 *
 * The screen exists because the checkout renders its instructions **only** from an active
 * `payment_recipient` row: before this, enabling a prepaid method required writing that row by hand,
 * so a fresh deployment could not take a prepaid order at all. Availability is not a separate switch
 * with its own state to drift - it *is* whether an active row exists, and that is what the checkout
 * reads at render and the order route re-reads inside the order transaction.
 */
export default async function AdminPaymentRecipientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.paymentRecipientManage);
  const params = await searchParams;

  const configuration = await withTransaction((tx) => recipientConfiguration(tx, actorOf(principal)));

  return (
    <RecipientsView
      rows={configuration.rows.map((row) => ({
        id: row.id,
        method: row.method,
        accountNumber: row.accountNumber,
        accountLabel: row.accountLabel,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        deactivatedAt: row.deactivatedAt === null ? null : row.deactivatedAt.toISOString(),
        claimCount: row.claimCount,
      }))}
      availableMethods={configuration.availableMethods}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
    />
  );
}
