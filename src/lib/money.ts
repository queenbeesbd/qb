import type { Money } from './types';

/** Currencies are integer poisha; all arithmetic stays in integers. */
export const POISHA_PER_BDT = 100;

export function toBdt(minor: Money): number {
  return Math.round(minor) / POISHA_PER_BDT;
}

/**
 * Formats a poisha amount for display in the one interface language.
 *
 * The currency is BDT and the digits are Latin: `Tk 1,150`. A price never changes with language
 * because there is no second language (Phase 28), and the stored value is unchanged either way.
 */
export function formatMoney(minor: Money): string {
  const value = toBdt(minor);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `Tk ${formatted}`;
}

/**
 * Parses a BDT amount the owner typed, for a **preview only**.
 *
 * The server is the authority (`parsePoisha` in `src/server/catalog/validation.ts`, which also applies
 * the one-million-BDT sanity bound); this exists so the form can show a live saving without importing
 * a server module into a client bundle. It is deliberately as strict as the server's rule - ASCII
 * digits, at most two decimals, no sign, no separator, no symbol - so the preview cannot accept
 * something the save will then refuse.
 *
 * Returns `null` for anything it cannot read, which the caller renders as "not a price yet".
 */
export function parseBdtInput(value: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (match === null) return null;
  const whole = Number.parseInt(match[1] ?? '', 10);
  const fractionDigits = match[2] ?? '';
  const fraction = fractionDigits === '' ? 0 : Number.parseInt(fractionDigits.padEnd(2, '0'), 10);
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Discount amount in poisha, or null when there is no valid discount. */
export function discountAmount(price: Money, compareAt: Money | null): Money | null {
  if (compareAt === null || compareAt <= price) return null;
  return compareAt - price;
}

/** Whole-percent discount, floored so it never overstates the saving. */
export function discountPercent(price: Money, compareAt: Money | null): number | null {
  if (compareAt === null || compareAt <= 0 || compareAt <= price) return null;
  return Math.floor(((compareAt - price) / compareAt) * 100);
}

/** Sums line totals in poisha using integer math. */
export function sumMinor(values: readonly Money[]): Money {
  return values.reduce((total, value) => total + Math.round(value), 0);
}

/** Normalizes an untrusted quantity into a bounded integer. */
export function clampQuantity(value: unknown, max = 20): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 1;
  const whole = Math.trunc(parsed);
  if (whole < 1) return 1;
  if (whole > max) return max;
  return whole;
}
