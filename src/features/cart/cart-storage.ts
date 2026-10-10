import { clampQuantity } from '@/lib/money';
import type { CartLine } from '@/lib/types';

/**
 * Cart persistence. Only product ids and integer quantities are stored - never
 * customer details, payment data or session tokens.
 */
export const CART_STORAGE_KEY = 'queenbees.cart.v1';

const MAX_QUANTITY = 20;
const MAX_LINES = 40;

export function sanitiseLines(value: unknown, knownIds: ReadonlySet<string>): CartLine[] {
  if (!Array.isArray(value)) return [];
  const lines: CartLine[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const productId = typeof record.productId === 'string' ? record.productId : '';
    if (!productId || !knownIds.has(productId) || seen.has(productId)) continue;
    seen.add(productId);
    lines.push({ productId, quantity: clampQuantity(record.quantity, MAX_QUANTITY) });
    if (lines.length >= MAX_LINES) break;
  }

  return lines;
}

export function readStoredLines(knownIds: ReadonlySet<string>): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    return sanitiseLines(JSON.parse(raw), knownIds);
  } catch {
    return [];
  }
}

export function writeStoredLines(lines: readonly CartLine[]): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable (private mode, quota): cart stays in memory */
  }
}

export { MAX_QUANTITY, MAX_LINES };
