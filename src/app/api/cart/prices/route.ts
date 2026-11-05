/**
 * GET /api/cart/prices - the unit price of each line in the customer's own cart.
 *
 * **Why this exists.** The floating cart box states a subtotal. Quantities live in the browser and the
 * catalog does not; handing the whole catalog to the layout to price five lines is exactly the 81 KB
 * page the cart cookie was introduced to remove (AGENTS.md, 2026-10-29). So the browser sends the ids it
 * already mirrors in `qb_cart`, and the server answers with a price per id.
 *
 * **What it is not.** It is not a quote, not a total and not authoritative: it returns no quantity, no
 * discount and no shipping, and the order transaction re-reads every price from `product_variant`.
 * A forged cookie can only ask about products the shop already publishes at prices the shop already
 * shows on its own product pages, so nothing here is private. The response is never cached.
 */

import { cookies } from 'next/headers';

import { withTransaction } from '@/db/client';
import { parseCartIds, CART_COOKIE_NAME } from '@/features/cart/cart-cookie';
import { listUnitPricesByIds } from '@/server/catalog/read';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const store = await cookies();
  const ids = parseCartIds(store.get(CART_COOKIE_NAME)?.value);

  if (ids.length === 0) {
    return Response.json({ prices: {} }, { headers: { 'cache-control': 'no-store' } });
  }

  const prices = await withTransaction((tx) => listUnitPricesByIds(tx, ids));
  return Response.json(
    { prices: Object.fromEntries(prices) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
