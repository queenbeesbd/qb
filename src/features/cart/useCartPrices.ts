'use client';

import { useEffect, useState } from 'react';

import type { CartLine } from '@/lib/types';

/** The unit price of every line the server could price, keyed by product id. */
export type CartPrices = Readonly<Record<string, number>>;

/**
 * The server's unit prices for the lines currently in the cart.
 *
 * The box that shows a subtotal needs the second half of the arithmetic - the prices - and deliberately
 * does not get the catalog. One request per distinct set of ids, aborted if the basket changes again
 * before it lands, so a customer clicking add-to-cart three times makes one call rather than three.
 *
 * The answer is stored **against the id set it was fetched for**, and read only when that set is still
 * the current one. That is what makes an emptied cart fall back to no prices without a synchronous
 * state write in an effect, and what keeps a stale answer from pricing a newer basket.
 *
 * A price that does not arrive stays **missing**, which is what makes the box show a count without an
 * amount instead of a made-up zero. Nothing here is authoritative: checkout recomputes every line.
 */
export function useCartPrices(lines: readonly CartLine[]): CartPrices {
  const signature = lines.map((line) => line.productId).sort().join('.');
  const [answer, setAnswer] = useState<{ signature: string; prices: CartPrices }>({
    signature: '',
    prices: {},
  });

  useEffect(() => {
    if (signature === '') return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/cart/prices', {
          signal: controller.signal,
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json()) as { prices?: Record<string, unknown> };
        const prices: Record<string, number> = {};
        for (const [id, value] of Object.entries(body.prices ?? {})) {
          if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) prices[id] = value;
        }
        setAnswer({ signature, prices });
      } catch {
        // An aborted or failed read leaves the answer as it was: the box then omits the amount rather
        // than stating one it could not verify.
      }
    })();

    return () => controller.abort();
  }, [signature]);

  return answer.signature === signature ? answer.prices : {};
}
