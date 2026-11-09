/**
 * The pure pricing rules, shared by the checkout preview, the cart and the server.
 *
 * This module has no database import on purpose: the browser may *preview* a charge and a discount with
 * the same functions the server resolves an order with, without gaining any authority. The server still
 * reads the configuration from the database, decides whether the caller is a repeat customer, and
 * recomputes every amount; a submitted total is never trusted.
 *
 * **The hierarchy is fixed (ADR 0029, amended 2026-11-10).** A product's own delivery charge, when
 * the basket carries one for the customer's area, is the whole charge - it is the shop's stated price
 * for delivering that product, not a benefit, so it is **not** re-priced by the repeat or conditional
 * rules. Otherwise, for a signed-in customer:
 *
 *   repeat delivery (repeat customer, rule on, rate for the area)
 *     -> conditional delivery (rule on, subtotal reaches the minimum, rate for the area)
 *       -> district override (existing)
 *         -> configured default (existing)
 *           -> refuse
 *
 * A guest never leaves the last two steps, whatever the subtotal. A rule that is switched on but has
 * no value for the area it would price **falls through** to the next step rather than charging an
 * assumed number - a half-filled rule must not become a guessed price.
 */

import { deliveryAreaByCode } from './delivery-areas';

export type DeliveryRates = {
  /** NULL means the owner has not configured the required default. */
  readonly defaultMinor: number | null;
  /** Active overrides only, keyed by delivery-area code. */
  readonly overrides: ReadonlyMap<string, number>;
  /** Optional so an existing caller that only knows the default rule stays valid. */
  readonly conditional?: ConditionalDeliveryRule;
  readonly repeat?: RepeatDeliveryRule;
  readonly repeatDiscount?: RepeatDiscountRule;
};

export type ConditionalDeliveryRule = {
  readonly enabled: boolean;
  /** The goods subtotal, in poisha, at which these rates begin to apply. */
  readonly minSubtotalMinor: number | null;
  readonly dhakaMinor: number | null;
  readonly chattogramMinor: number | null;
  /** Dhaka and Chattogram have their own field; every other district uses this one. */
  readonly othersMinor: number | null;
};

export type RepeatDeliveryRule = {
  readonly enabled: boolean;
  readonly chattogramMinor: number | null;
  /** Dhaka and every other district. The owner configures two repeat rates, not three. */
  readonly othersMinor: number | null;
};

export type RepeatDiscountRule = {
  readonly enabled: boolean;
  /** Whole percent, 1-100. */
  readonly percent: number | null;
  readonly minSubtotalMinor: number | null;
};

/** Who is asking, and for how much. Never a request field: the server derives all three. */
export type DeliveryPricingContext = {
  readonly subtotalMinor: number;
  /** False for a guest - and a guest is never eligible for a conditional or repeat benefit. */
  readonly authenticated: boolean;
  /** At least one **completed** order. The server decides this; the browser only previews it. */
  readonly repeatCustomer: boolean;
};

/**
 * A product's own delivery charges, one per area, in poisha.
 *
 * `null` is the ordinary case: the product is delivered at the store's configured charge. A number is
 * the owner's own price for delivering that product to that area; zero means free delivery, which is
 * why the fields are nullable rather than zero-filled - blank and "free" are different statements.
 */
export type ProductDeliveryMinor = {
  readonly chattogram: number | null;
  readonly dhaka: number | null;
  readonly others: number | null;
};

/** The neutral value: no fee of its own, so the store's charge decides. */
export const NO_PRODUCT_DELIVERY: ProductDeliveryMinor = { chattogram: null, dhaka: null, others: null };

/**
 * The basket's own delivery charge for an area: the **lowest** fee any product in the basket states
 * for that area, or `null` when none does.
 *
 * The owner's rule: one product with a custom fee and others without uses the custom fee; several
 * products with custom fees use the lowest. Lowest rather than highest is deliberate - the shopper
 * chose what to buy, and charging the largest of several stated prices would punish a larger basket.
 * An invalid or negative number is ignored rather than trusted.
 */
export function customDeliveryMinor(
  items: readonly (ProductDeliveryMinor | null | undefined)[],
  areaCode: unknown,
): number | null {
  if (typeof areaCode !== 'string') return null;
  let lowest: number | null = null;
  for (const item of items) {
    if (item === null || item === undefined) continue;
    const fee =
      areaCode === 'dhaka'
        ? item.dhaka
        : areaCode === 'chattogram'
          ? item.chattogram
          : areaCode === 'others'
            ? item.others
            : null;
    if (!validAmount(fee)) continue;
    if (lowest === null || fee < lowest) lowest = fee;
  }
  return lowest;
}

export type DeliveryQuoteSource = 'product' | 'repeat' | 'conditional' | 'district' | 'default';

export type DeliveryQuote = {
  readonly areaCode: string;
  readonly chargeMinor: number;
  readonly source: DeliveryQuoteSource;
};

export type DeliveryQuoteResult =
  | { readonly ok: true; readonly quote: DeliveryQuote }
  | { readonly ok: false; readonly reason: 'invalid_district' | 'unconfigured' };

/** The area's own conditional rate, or `null` when this rule cannot price this area. */
function conditionalRate(rule: ConditionalDeliveryRule, areaCode: string): number | null {
  if (areaCode === 'dhaka') return rule.dhakaMinor;
  if (areaCode === 'chattogram') return rule.chattogramMinor;
  return rule.othersMinor;
}

function validAmount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The existing default rule: an active district override, otherwise the configured default, otherwise
 * a refusal. Kept exactly as it was for callers that only know the default configuration.
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

/**
 * The full hierarchy: repeat delivery, then conditional delivery, then the existing default rule.
 *
 * **A guest stops at the default rule.** `authenticated` is not a hint - it is the first condition of
 * both benefits, so an anonymous request cannot be priced by either however its subtotal is shaped.
 */
export function quoteOrderDelivery(
  rates: DeliveryRates,
  areaCode: unknown,
  context: DeliveryPricingContext,
  /** The basket's own fee (`customDeliveryMinor`), or null when no product states one. */
  productChargeMinor: number | null = null,
): DeliveryQuoteResult {
  const area = typeof areaCode === 'string' ? deliveryAreaByCode(areaCode) : null;
  if (area === null) return { ok: false, reason: 'invalid_district' };

  /*
   * The product's stated price comes first and applies to guests too: it is what the shop charges to
   * deliver that product, not a benefit tied to an account, and it is still snapshotted on the order.
   */
  if (validAmount(productChargeMinor)) {
    return {
      ok: true,
      quote: { areaCode: area.code, chargeMinor: productChargeMinor, source: 'product' },
    };
  }

  if (context.authenticated) {
    const repeat = rates.repeat;
    if (repeat !== undefined && repeat.enabled && context.repeatCustomer) {
      // Chattogram has its own repeat rate; Dhaka and every other district share the second one.
      const rate = area.code === 'chattogram' ? repeat.chattogramMinor : repeat.othersMinor;
      if (validAmount(rate)) {
        return { ok: true, quote: { areaCode: area.code, chargeMinor: rate, source: 'repeat' } };
      }
    }

    const conditional = rates.conditional;
    if (
      conditional !== undefined &&
      conditional.enabled &&
      validAmount(conditional.minSubtotalMinor) &&
      context.subtotalMinor >= conditional.minSubtotalMinor
    ) {
      const rate = conditionalRate(conditional, area.code);
      if (validAmount(rate)) {
        return { ok: true, quote: { areaCode: area.code, chargeMinor: rate, source: 'conditional' } };
      }
    }
  }

  return quoteDelivery(rates, area.code);
}

/**
 * The automatic repeat-customer discount, in poisha. Zero when the rule is off, the caller is not a
 * repeat customer (a guest never is), or the subtotal has not reached the configured minimum.
 *
 * Integer arithmetic only, floored: 5% of 2,500.99 BDT is 125.04 BDT, never a paisa more than the
 * percentage the owner published.
 */
export function repeatDiscountMinor(rates: DeliveryRates, context: DeliveryPricingContext): number {
  const rule = rates.repeatDiscount;
  if (rule === undefined || !rule.enabled) return 0;
  if (!context.authenticated || !context.repeatCustomer) return 0;
  if (!validAmount(rule.minSubtotalMinor) || context.subtotalMinor < rule.minSubtotalMinor) return 0;

  const percent = rule.percent;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent <= 0 || percent > 100) return 0;
  if (!Number.isSafeInteger(context.subtotalMinor) || context.subtotalMinor <= 0) return 0;

  const discount = Math.floor((context.subtotalMinor * percent) / 100);
  return Math.max(0, Math.min(discount, context.subtotalMinor));
}
