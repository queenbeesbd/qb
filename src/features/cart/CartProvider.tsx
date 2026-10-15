'use client';

import {
  createContext,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { clampQuantity, discountAmount, sumMinor } from '@/lib/money';
import type { CartLine, CatalogItem, Money } from '@/lib/types';
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

export type CartEntry = {
  product: CatalogItem;
  quantity: number;
  lineTotalMinor: Money;
};

export type CartSummary = {
  entries: CartEntry[];
  itemCount: number;
  lineCount: number;
  subtotalMinor: Money;
  savingsMinor: Money;
  isEmpty: boolean;
};

type CartContextValue = CartSummary & {
  addItem: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  lastAddedId: string | null;
  maxQuantity: number;
};

export const CartContext = createContext<CartContextValue | null>(null);

/**
 * Single source of truth for demo cart state and derived totals. All money
 * arithmetic happens here in integer poisha so no component can drift, and the
 * underlying lines live in an external store so no component re-derives them.
 *
 * The catalog snapshot is supplied by the server layout as plain product props;
 * this provider is the only place a product id is resolved to a record, and it
 * seeds the external store's id registry so a restored line is always validated
 * against the products the storefront actually sells.
 *
 * This state is presentation-only. It is never authoritative for a real order:
 * a future production checkout must recompute prices, discounts, stock and
 * totals on a trusted server.
 */
export function CartProvider({
  products,
  children,
}: {
  products: readonly CatalogItem[];
  children: ReactNode;
}) {
  const productById = useMemo(() => {
    // Seeding happens during render, before `useSyncExternalStore` subscribes
    // and the store hydrates, so restored lines are validated against the real
    // catalog ids rather than being dropped.
    setKnownProductIds(products.map((product) => product.id));
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const addItem = useCallback((productId: string, quantity = 1) => {
    addLine(productId, quantity);
    setLastAddedId(productId);
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLineQuantity(productId, quantity);
  }, []);

  const removeItem = useCallback((productId: string) => {
    removeLine(productId);
  }, []);

  const clear = useCallback(() => clearLines(), []);

  const summary = useMemo<CartSummary>(() => {
    const entries: CartEntry[] = [];
    let savingsMinor = 0;

    for (const line of lines) {
      const product = productById.get(line.productId);
      if (!product) continue;
      const quantity = clampQuantity(line.quantity, MAX_QUANTITY);
      const lineTotalMinor = product.priceMinor * quantity;
      const perItemSaving = discountAmount(product.priceMinor, product.compareAtPriceMinor) ?? 0;
      savingsMinor += perItemSaving * quantity;
      entries.push({ product, quantity, lineTotalMinor });
    }

    const subtotalMinor = sumMinor(entries.map((entry) => entry.lineTotalMinor));
    const itemCount = entries.reduce((total, entry) => total + entry.quantity, 0);

    return {
      entries,
      itemCount,
      lineCount: entries.length,
      subtotalMinor,
      savingsMinor,
      isEmpty: entries.length === 0,
    };
  }, [lines, productById]);

  const value = useMemo<CartContextValue>(
    () => ({
      ...summary,
      addItem,
      setQuantity,
      removeItem,
      clear,
      lastAddedId,
      maxQuantity: MAX_QUANTITY,
    }),
    [summary, addItem, setQuantity, removeItem, clear, lastAddedId],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export type { CartLine };
