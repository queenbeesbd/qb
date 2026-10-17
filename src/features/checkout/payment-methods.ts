/**
 * Payment-method selection rules for checkout.
 *
 * Kept as pure functions in their own module so the rules are unit-testable without a browser, and so
 * the form cannot drift from them. Two rules matter:
 *
 *  - **COD is always available** - it needs no owner-configured recipient and no claim.
 *  - **A prepaid method is available only when the owner has configured a recipient for it.** With no
 *    configured recipient the method renders as unavailable and collects nothing (ADR 0014): the form
 *    must never ask for a sender number, a reference or an amount for a method that cannot receive one.
 */

export const PAYMENT_METHODS = ['bkash', 'nagad', 'cod'] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

/** True when this method can actually be chosen, given the methods the owner has configured. */
export function isMethodConfigured(
  value: PaymentMethodValue,
  configuredMethods: readonly string[],
): boolean {
  return value === 'cod' || configuredMethods.includes(value);
}

/**
 * The method selected when the form first renders. The first *available* prepaid method, in the order
 * the storefront presents them, and COD when no prepaid method is configured at all.
 *
 * This is deliberately not a hard-coded `'bkash'`: a disabled radio cannot be submitted, so
 * pre-selecting an unavailable method produced a form whose payment choice was missing from the
 * request - a refusal the customer had no way to explain or fix.
 */
export function defaultPaymentMethod(configuredMethods: readonly string[]): PaymentMethodValue {
  for (const value of PAYMENT_METHODS) {
    if (value === 'cod') break;
    if (configuredMethods.includes(value)) return value;
  }
  return 'cod';
}
