/**
 * Values shared by the promo-code editor and the pages that mount it.
 *
 * Deliberately **not** inside the `'use client'` form module: a server component that imported a
 * function from a client module would get a client reference, not a function, and calling it throws at
 * request time. Plain data and pure helpers live here, where both sides may import them.
 */

export type PromoFormValues = {
  code: string;
  description: string;
  kind: 'percent' | 'fixed';
  percentOff: string;
  amountOff: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
};

/** Taka, without a symbol: the value the owner typed, and could type again. */
export function takaInput(minor: number | null): string {
  if (minor === null || minor <= 0) return '';
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** The editor's starting values for a new code. Percentage off, because that is what owners publish. */
export const emptyPromoForm: PromoFormValues = {
  code: '',
  description: '',
  kind: 'percent',
  percentOff: '',
  amountOff: '',
  minOrder: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
};
