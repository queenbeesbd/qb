import { clampQuantity } from '@/lib/money';
import type { CartLine } from '@/lib/types';
import { mirrorCartCookie } from './cart-cookie';
import { MAX_LINES, MAX_QUANTITY, readStoredLines, writeStoredLines } from './cart-storage';

/**
 * Cart external store. React's `useSyncExternalStore` reads this module-level
 * state instead of hydrating via setState inside an effect, which keeps the
 * server snapshot (empty) and the client snapshot (restored) explicit and
 * avoids a cascading render on mount.
 *
 * Only product ids and integer quantities are ever persisted.
 */

/**
 * The product ids the catalog actually contains, supplied by `CartProvider` from
 * the server-rendered catalog snapshot. A persisted line is validated against
 * this set, so stale or tampered `localStorage` cannot restore a line for a
 * product the storefront does not sell. It starts empty, which is safe: an
 * unseeded store simply refuses every id rather than trusting the browser.
 */
let knownIds: ReadonlySet<string> = new Set<string>();

export function setKnownProductIds(ids: readonly string[]): void {
  knownIds = new Set(ids);
}

/** Stable reference returned on the server and before client hydration. */
const EMPTY: readonly CartLine[] = Object.freeze([]);

let lines: readonly CartLine[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function commit(next: readonly CartLine[]): void {
  lines = next;
  writeStoredLines(next);
  /*
   * The cart page is drawn on the server, so the ids it needs have to be visible to the server before
   * the customer navigates. `localStorage` never leaves the browser; this cookie does. It carries ids
   * only and decides nothing - see cart-cookie.ts for why that is safe.
   */
  mirrorCartCookie(next);
  emit();
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const stored = readStoredLines(knownIds);
  /*
   * Re-mirror on every load, including an empty cart. A browser that dropped the cookie (or a cart
   * saved before this mirror existed) would otherwise leave the cart page with nothing to project,
   * which is exactly the mismatch `useCartProjection` recovers from - cheaper to prevent it here.
   */
  mirrorCartCookie(stored);
  if (stored.length > 0) {
    lines = stored;
    emit();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  hydrate();
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): readonly CartLine[] {
  return lines;
}

export function getServerSnapshot(): readonly CartLine[] {
  return EMPTY;
}

export function addLine(productId: string, quantity: number): void {
  if (!knownIds.has(productId)) return;
  const existing = lines.find((line) => line.productId === productId);
  if (existing) {
    commit(
      lines.map((line) =>
        line.productId === productId
          ? { ...line, quantity: clampQuantity(line.quantity + quantity, MAX_QUANTITY) }
          : line,
      ),
    );
    return;
  }
  if (lines.length >= MAX_LINES) return;
  commit([...lines, { productId, quantity: clampQuantity(quantity, MAX_QUANTITY) }]);
}

export function setLineQuantity(productId: string, quantity: number): void {
  commit(
    lines.map((line) =>
      line.productId === productId
        ? { ...line, quantity: clampQuantity(quantity, MAX_QUANTITY) }
        : line,
    ),
  );
}

export function removeLine(productId: string): void {
  commit(lines.filter((line) => line.productId !== productId));
}

export function clearLines(): void {
  commit([]);
}

export function isKnownProduct(productId: string): boolean {
  return knownIds.has(productId);
}
