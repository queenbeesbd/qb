/**
 * The account facts the customer dashboard prints about the person signed in.
 *
 * A read of the customer's own row, scoped by the session's `customerId` like every other account read:
 * there is no variant that takes an email or an id from the caller. It returns the creation time the
 * account page states as "member since" - a stored fact - and nothing else, because every other value
 * the dashboard shows comes from the order rows themselves.
 */

import { sql } from 'drizzle-orm';

import type { Transaction } from '@/db/client';
import { customer } from '@/db/schema';

export type CustomerProfile = {
  readonly createdAt: Date | null;
};

export async function readCustomerProfile(
  tx: Transaction,
  customerId: number,
): Promise<CustomerProfile> {
  const rows = await tx
    .select({ createdAt: customer.createdAt })
    .from(customer)
    .where(sql`${customer.id} = ${customerId} and ${customer.deletedAt} is null`)
    .limit(1);

  return { createdAt: rows[0]?.createdAt ?? null };
}
