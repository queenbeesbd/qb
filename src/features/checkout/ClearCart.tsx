'use client';

import { useEffect } from 'react';
import { useCart } from '@/features/cart/useCart';

/**
 * Clears the browser cart **once**, after an order has actually been placed.
 *
 * It mounts only on the confirmation page and only when the server marked the visit as a fresh
 * placement, so revisiting an older order never wipes a cart that belongs to a new one. Clearing the
 * external store is not React state, so this does not set state inside the effect.
 */
export function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
