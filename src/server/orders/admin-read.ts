/**
 * Admin reads for the payments, COD and customer queues.
 *
 * Read-only projections for the owner screens. They carry the minimum data each screen needs -
 * payments evidence without session or credential data, customer standing without a full profile -
 * and each is called from a page that has already checked the page permission.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customerFlag, paymentClaim } from '@/db/schema';
import { listCodApprovalQueue, listCustomers, listVerificationQueue } from './manage';

export type PaymentsQueueItem = {
  readonly claimId: number;
  readonly orderId: number;
  readonly orderNumber: string;
  readonly submittedAt: Date;
  readonly method: string;
  readonly recipientNumber: string;
  readonly recipientLabel: string;
  readonly senderMsisdn: string;
  readonly transactionReference: string;
  readonly claimedAmountMinor: number;
  readonly orderTotalMinor: number;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly area: string;
  readonly city: string;
  readonly addressLine: string;
  readonly held: boolean;
  /** The same transaction reference appears on another submitted claim - surface before any decision. */
  readonly duplicateReference: boolean;
};

/** The prepaid verification worklist, oldest submission first, with duplicate-reference flags. */
export async function paymentsQueue(tx: Transaction): Promise<PaymentsQueueItem[]> {
  const rows = await listVerificationQueue(tx);
  const duplicates = await duplicateReferenceSet(tx);
  return rows.map((row) => ({
    claimId: row.claimId,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    submittedAt: row.submittedAt,
    method: row.paymentMethod,
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
    held: row.hasOpenHold,
    duplicateReference: duplicates.has(row.transactionReference),
  }));
}

async function duplicateReferenceSet(tx: Transaction): Promise<Set<string>> {
  const rows = await tx
    .select({ reference: paymentClaim.transactionReference, uses: sql<number>`count(*)::int` })
    .from(paymentClaim)
    .where(sql`${paymentClaim.state} = 'submitted'`)
    .groupBy(paymentClaim.transactionReference);
  return new Set(rows.filter((row) => row.uses > 1).map((row) => row.reference));
}

export type CodQueueItem = {
  readonly orderId: number;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly totalMinor: number;
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly area: string;
  readonly city: string;
  readonly addressLine: string;
};

/** The COD approval worklist, oldest order first. */
export async function codQueue(tx: Transaction): Promise<CodQueueItem[]> {
  return listCodApprovalQueue(tx);
}

export type CustomersQueueItem = {
  readonly customerId: number;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAt: Date;
  readonly orderCount: number;
  readonly lastOrderAt: Date | null;
  readonly flagged: boolean;
};

/** Customers with their standing, for the moderation screen. Nothing beyond what it needs. */
export async function customers(tx: Transaction): Promise<CustomersQueueItem[]> {
  return listCustomers(tx);
}

/** A customer's raised review flag, if any - shown on the customer screen, cleared there too. */
export async function customerFlagInfo(
  tx: Transaction,
  customerId: number,
): Promise<{ reason: string; raisedAt: Date } | null> {
  const rows = await tx
    .select({ reason: customerFlag.reason, raisedAt: customerFlag.raisedAt })
    .from(customerFlag)
    .where(sql`${customerFlag.customerId} = ${customerId} and ${customerFlag.state} = 'raised'`)
    .limit(1);
  return rows[0] ?? null;
}

