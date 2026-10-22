/**
 * Promotion code rules - pure, and shared by every caller.
 *
 * The same evaluator runs behind the owner's preview, the checkout preview endpoint and order creation,
 * so the number a customer is shown and the number stored on the order cannot disagree. It is a pure
 * function over a stored rule and a subtotal: no database, no clock of its own, no request.
 *
 * **Money stays integral.** A percentage is floored, never rounded up, so a discount can never exceed the
 * percentage the owner published, and the result is clamped to the subtotal so a code can never make an
 * order cost less than its delivery charge.
 *
 * **Refusals are named.** "This code does not work" is not an answer the customer can act on; each rule
 * that can fail has its own reason, which the interface turns into a sentence.
 */

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export type PromoKind = 'percent' | 'fixed';

/** The stored shape of a code, independent of the table that holds it. */
export type PromoRule = {
  readonly code: string;
  readonly kind: PromoKind;
  readonly percentOff: number | null;
  readonly amountOffMinor: number | null;
  readonly minOrderMinor: number;
  readonly maxDiscountMinor: number | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly isActive: boolean;
};

export type PromoRefusalReason =
  | 'unknown'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'below_minimum'
  | 'exhausted'
  | 'no_benefit';

export type PromoEvaluation =
  | { readonly ok: true; readonly code: string; readonly discountMinor: number }
  | { readonly ok: false; readonly reason: PromoRefusalReason };

/**
 * Reads a code the way a customer typed it.
 *
 * Case and surrounding whitespace are forgiven, because a code copied from a post arrives with both.
 * Anything else - punctuation, spaces inside, a shorter or longer string - is not a code at all, and
 * returns null rather than being repaired into something the owner never published.
 */
export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const candidate = raw.trim().toUpperCase();
  return PROMO_CODE_PATTERN.test(candidate) ? candidate : null;
}

/** The discount a rule yields for a subtotal, before any schedule or usage check. Always >= 0. */
export function promoDiscountMinor(rule: PromoRule, subtotalMinor: number): number {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor <= 0) return 0;

  let discount: number;
  if (rule.kind === 'percent') {
    const percent = rule.percentOff ?? 0;
    if (percent <= 0 || percent > 100) return 0;
    // Integer arithmetic only: floor after multiplying, so 7% of 999 poisha is 69, never 70.
    discount = Math.floor((subtotalMinor * percent) / 100);
  } else {
    discount = rule.amountOffMinor ?? 0;
  }

  if (rule.maxDiscountMinor !== null) discount = Math.min(discount, rule.maxDiscountMinor);
  // The goods are the only thing a code may reduce; delivery is charged separately and stays payable.
  discount = Math.min(discount, subtotalMinor);
  return Math.max(0, discount);
}

/**
 * Decides whether a code applies to this cart right now.
 *
 * `redemptions` is the number of orders that have already used the code - passed in rather than counted
 * here, so the caller controls the lock and this function stays pure.
 */
export function evaluatePromo(
  rule: PromoRule,
  context: { readonly subtotalMinor: number; readonly now: Date; readonly redemptions: number },
): PromoEvaluation {
  if (!rule.isActive) return { ok: false, reason: 'inactive' };
  if (rule.startsAt !== null && context.now.getTime() < rule.startsAt.getTime()) {
    return { ok: false, reason: 'not_started' };
  }
  if (rule.endsAt !== null && context.now.getTime() >= rule.endsAt.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  if (context.subtotalMinor < rule.minOrderMinor) return { ok: false, reason: 'below_minimum' };
  if (rule.maxRedemptions !== null && context.redemptions >= rule.maxRedemptions) {
    return { ok: false, reason: 'exhausted' };
  }

  const discountMinor = promoDiscountMinor(rule, context.subtotalMinor);
  // A live code that reduces nothing is a refusal, not a zero-value redemption: the customer would get
  // no benefit and the code would spend one of its uses.
  if (discountMinor <= 0) return { ok: false, reason: 'no_benefit' };

  return { ok: true, code: rule.code, discountMinor };
}