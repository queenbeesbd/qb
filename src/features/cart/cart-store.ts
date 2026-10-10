import { products } from '@/data/catalog';
import { clampQuantity } from '@/lib/money';
import type { CartLine } from '@/lib/types';
import { MAX_LINES, MAX_QUANTITY, readStoredLines, writeStoredLines } from './cart-storage';

/**
 * Cart external store. React's `useSyncExternalStore` reads this module-level
 * state instead of hydrating via setState inside an effect, which keeps the
 * server snapshot (empty) and the client snapshot (restored) explicit and
 * avoids a cascading render on mount.
 *
 * Only product ids and integer quantities are ever persisted.
 */

const KNOWN_IDS = new Set(products.map((product) => product.id));

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
  emit();
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const stored = readStoredLines(KNOWN_IDS);
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
  if (!KNOWN_IDS.has(productId)) return;
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
  return KNOWN_IDS.has(productId);
}
