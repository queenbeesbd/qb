/**
 * One order as the account screens draw it.
 *
 * A projection of `CustomerOrderSummary`: the frozen totals, the states and the placement time, and
 * nothing the customer does not read - no internal id, no other customer's data, no payment recipient.
 */
export type DashboardOrder = {
  readonly orderNumber: string;
  readonly status: string;
  readonly paymentState: string;
  readonly codState: string;
  readonly paymentMethod: string;
  readonly districtCode: string | null;
  readonly itemsSubtotalMinor: number;
  readonly shippingMinor: number;
  readonly totalMinor: number;
  /** ISO 8601, already serialised by the page so the view holds no `Date`. */
  readonly placedAt: string;
  readonly itemCount: number;
};

/** The signed-in customer, as the shell prints them. */
export type DashboardCustomer = {
  readonly email: string;
  readonly phone: string | null;
  /** False until the address is confirmed; the account is usable either way. */
  readonly emailVerified: boolean;
  readonly displayName: string | null;
  /** ISO 8601, or null when the row's timestamp could not be read. */
  readonly memberSince: string | null;
};
