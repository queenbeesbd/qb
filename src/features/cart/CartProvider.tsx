'use client';

import {
  createContext,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { products } from '@/data/catalog';
import { clampQuantity, discountAmount, sumMinor } from '@/lib/money';
import type { CartLine, Money, Product } from '@/lib/types';
import { MAX_QUANTITY } from './cart-storage';
import {
  addLine,
  clearLines,
  getServerSnapshot,
  getSnapshot,
  removeLine,
  setLineQuantity,
  subscribe,
} from './cart-store';

export type CartEntry = {
  product: Product;
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

const PRODUCT_BY_ID = new Map(products.map((product) => [product.id, product]));

/**
 * Single source of truth for demo cart state and derived totals. All money
 * arithmetic happens here in integer poisha so no component can drift, and the
 * underlying lines live in an external store so no component re-derives them.
 *
 * This state is presentation-only. It is never authoritative for a real order:
 * a future production checkout must recompute prices, discounts, stock and
 * totals on a trusted server.
 */
export function CartProvider({ children }: { children: ReactNode }) {
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
      const product = PRODUCT_BY_ID.get(line.productId);
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
  }, [lines]);

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
