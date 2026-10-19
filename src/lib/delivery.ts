/**
 * The pure delivery-pricing rule, shared by the checkout preview and the server.
 *
 * This module has no database import on purpose: the browser may *preview* a charge with the same
 * function the server resolves an order with, without gaining any authority. The server still reads the
 * configuration from the database and recomputes every amount; a submitted total is never trusted.
 */

import { deliveryAreaByCode } from './delivery-areas';

export type DeliveryRates = {
  /** NULL means the owner has not configured the required default. */
  readonly defaultMinor: number | null;
  /** Active overrides only, keyed by delivery-area code. */
  readonly overrides: ReadonlyMap<string, number>;
};

export type DeliveryQuote = {
  readonly areaCode: string;
  readonly chargeMinor: number;
  readonly source: 'district' | 'default';
};

export type DeliveryQuoteResult =
  | { readonly ok: true; readonly quote: DeliveryQuote }
  | { readonly ok: false; readonly reason: 'invalid_district' | 'unconfigured' };

/**
 * Active area override, otherwise the configured default, otherwise a refusal.
 *
 * An empty map plus a null default is **unconfigured**, not free delivery. There is no inference from
 * the free-text address: the area must be one of the canonical codes.
 */
export function quoteDelivery(rates: DeliveryRates, areaCode: unknown): DeliveryQuoteResult {
  const area = typeof areaCode === 'string' ? deliveryAreaByCode(areaCode) : null;
  if (area === null) return { ok: false, reason: 'invalid_district' };

  // The "other districts" area is priced by the default; an override stored for it is ignored.
  const override = area.usesDefault ? undefined : rates.overrides.get(area.code);
  if (override !== undefined) {
    return { ok: true, quote: { areaCode: area.code, chargeMinor: override, source: 'district' } };
  }
  if (rates.defaultMinor === null) return { ok: false, reason: 'unconfigured' };
  return { ok: true, quote: { areaCode: area.code, chargeMinor: rates.defaultMinor, source: 'default' } };
}
