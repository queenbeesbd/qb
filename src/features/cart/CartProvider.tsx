'use client';

import {
  createContext,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { CartLine } from '@/lib/types';
import { trackVisit } from '@/features/analytics/track';
import { MAX_QUANTITY } from './cart-storage';
import {
  addLine,
  clearLines,
  getServerSnapshot,
  getSnapshot,
  removeLine,
  setKnownProductIds,
  setLineQuantity,
  subscribe,
} from './cart-store';

export type { CartEntry, ResolvedCart } from './cart-lines';
export { resolveCartLines } from './cart-lines';

type CartContextValue = {
  /** The stored lines, not resolved against a product. Views that draw a line resolve them. */
  lines: readonly CartLine[];
  itemCount: number;
  lineCount: number;
  isEmpty: boolean;
  addItem: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  lastAddedId: string | null;
  maxQuantity: number;
};

export const CartContext = createContext<CartContextValue | null>(null);

/**
 * The browser cart: ids, quantities and the actions that change them.
 *
 * **The provider deliberately does not hold product records.** After the catalog import, handing the
 * whole catalog to this component put 1,477 products in every route's payload. A line's name, picture
 * and price are only needed by the two routes that draw lines, so those routes pass the compact
 * projection (cart-product.ts) to `resolveCartLines` and every other route pays nothing for it.
 *
 * What remains here is what every page genuinely needs: the lines, the item count for the header and
 * tab bar, and the id registry a restored line is validated against. Counts are derived from the
 * lines themselves - no product lookup - so the badge is correct on a product page, where no
 * product records exist.
 *
 * All money arithmetic happens where lines are resolved, in integer poisha. This state is
 * presentation-only and never authoritative for an order: checkout recomputes prices on the server.
 */
export function CartProvider({
  productIds,
  children,
}: {
  /**
   * Every id the storefront sells, supplied by the server layout. A persisted line is validated
   * against this set, so stale or tampered storage cannot restore a line for a product the shop no
   * longer sells. It is a few kilobytes rather than a megabyte of records.
   */
  productIds: readonly string[];
  children: ReactNode;
}) {
  // Seeding happens during render, before `useSyncExternalStore` subscribes and the store hydrates,
  // so restored lines are validated against the real catalog rather than being dropped.
  useMemo(() => {
    setKnownProductIds(productIds);
    return productIds;
  }, [productIds]);

  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const addItem = useCallback((productId: string, quantity = 1) => {
    addLine(productId, quantity);
    setLastAddedId(productId);
    // The cart is the funnel's middle step, and it happens without a navigation (ADR 0025).
    trackVisit('cart_add', typeof window === 'undefined' ? '/' : window.location.pathname);
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLineQuantity(productId, quantity);
  }, []);

  const removeItem = useCallback((productId: string) => {
    removeLine(productId);
  }, []);

  const clear = useCallback(() => clearLines(), []);

  const itemCount = lines.reduce((total, line) => total + line.quantity, 0);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount,
      lineCount: lines.length,
      isEmpty: lines.length === 0,
      addItem,
      setQuantity,
      removeItem,
      clear,
      lastAddedId,
      maxQuantity: MAX_QUANTITY,
    }),
    [lines, itemCount, addItem, setQuantity, removeItem, clear, lastAddedId],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export type { CartLine };