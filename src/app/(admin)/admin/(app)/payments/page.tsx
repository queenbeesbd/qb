import { withTransaction } from '@/db/client';
import { requireAdminPage } from '@/server/auth/guard';
import { hasPermission } from '@/server/authz/principal';
import { PERMISSIONS } from '@/server/authz/permissions';
import { paymentsQueue } from '@/server/orders/admin-read';
import { PaymentsView, type PaymentNotice } from './PaymentsView';

export const dynamic = 'force-dynamic';

const NOTICES: readonly PaymentNotice[] = [
  'verified',
  'rejected',
  'falselyClaimed',
  'held',
  'holdReleased',
  'denied',
  'conflict',
  'invalid',
];

function readNotice(value: string | string[] | undefined): PaymentNotice | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  return (NOTICES as readonly string[]).includes(candidate) ? (candidate as PaymentNotice) : null;
}

/**
 * The prepaid payment-verification queue.
 *
 * Requires `order.read` to view (the evidence on screen is payment and delivery data), and each
 * action requires its own permission server-side: `payment.verify`, `payment.reject` or
 * `payment.flag_false`. Nothing here decides on its own; a mismatch is a flag, never an outcome.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requireAdminPage(PERMISSIONS.orderRead);
  const params = await searchParams;

  const rows = await withTransaction((tx) => paymentsQueue(tx));

  return (
    <PaymentsView
      rows={rows.map((row) => ({
        claimId: row.claimId,
        orderNumber: row.orderNumber,
        submittedAt: row.submittedAt.toISOString(),
        method: row.method,
        recipientNumber: row.recipientNumber,
        recipientLabel: row.recipientLabel,
        senderMsisdn: row.senderMsisdn,
        transactionReference: row.transactionReference,
        claimedAmountMinor: row.claimedAmountMinor,
        orderTotalMinor: row.orderTotalMinor,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        area: row.area,
        city: row.city,
        addressLine: row.addressLine,
        held: row.held,
        duplicateReference: row.duplicateReference,
      }))}
      notice={readNotice(params.notice)}
      csrfToken={principal.csrfToken}
      canVerify={hasPermission(principal, PERMISSIONS.paymentVerify)}
      canReject={hasPermission(principal, PERMISSIONS.paymentReject)}
      canFlagFalse={hasPermission(principal, PERMISSIONS.paymentFlagFalse)}
    />
  );
}