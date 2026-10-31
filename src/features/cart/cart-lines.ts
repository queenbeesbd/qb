import { clampQuantity, discountAmount, sumMinor } from '@/lib/money';
import type { CartLine, Money } from '@/lib/types';
import type { CartProduct } from './cart-product';
import { MAX_QUANTITY } from './cart-storage';

/** One cart line with the product it draws and its money already derived. */
export type CartEntry = {
  product: CartProduct;
  quantity: number;
  lineTotalMinor: Money;
};

export type ResolvedCart = {
  entries: CartEntry[];
  subtotalMinor: Money;
  savingsMinor: Money;
};

/**
 * Resolves stored ids and quantities against the products a route supplied.
 *
 * The cart is ids and numbers in the browser; a line's name, picture and price are read from the
 * catalog on every render, never remembered in storage. That is why a price change is picked up
 * immediately, and why a line whose product has left the catalog simply resolves to nothing.
 *
 * Only `/cart` and `/checkout` can pass products - they are the routes that draw lines - so this
 * function lives beside the provider rather than inside it. The provider above them cannot know
 * which products a line needs without shipping the whole catalog to every page.
 */
export function resolveCartLines(
  lines: readonly CartLine[],
  products: readonly CartProduct[],
): ResolvedCart {
  const productById = new Map(products.map((product) => [product.id, product]));
  const entries: CartEntry[] = [];
  let savingsMinor = 0;

  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product) continue;
    const quantity = clampQuantity(line.quantity, MAX_QUANTITY);
    entries.push({ product, quantity, lineTotalMinor: product.priceMinor * quantity });
    savingsMinor += (discountAmount(product.priceMinor, product.compareAtPriceMinor) ?? 0) * quantity;
  }

  return {
    entries,
    subtotalMinor: sumMinor(entries.map((entry) => entry.lineTotalMinor)),
    savingsMinor,
  };
}