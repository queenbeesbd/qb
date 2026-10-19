/**
 * Admin reads for the COD and customer queues.
 *
 * Read-only projections for the owner screens. They carry the minimum data each screen needs -
 * delivery contact without payment evidence, customer standing without a full profile - and each is
 * called from a page that has already checked the page permission.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customerFlag } from '@/db/schema';
import { listCodApprovalQueue, listCustomers } from './manage';

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
