import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { CART_COOKIE_NAME, parseCartIds } from '@/features/cart/cart-cookie';
import { selectCartProducts } from '@/features/cart/cart-product';
import { CartView } from '@/features/cart/CartView';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

export const metadata: Metadata = { title: 'Cart' };

/**
 * The cart page.
 *
 * It is one of the two routes that draws a cart line, so it is one of the two that needs product
 * records. Since Phase 45b it asks for the products the **cart** names rather than for the catalog:
 * the browser mirrors its line ids into a first-party cookie (`qb_cart`), this page reads them,
 * validates each id against the catalog and projects only those rows.
 *
 * The cookie is a hint, never an authority. It cannot add a line - the cart store decides that - and a
 * price, name or availability still comes from the catalog row the id resolves to. A tampered or stale
 * id is dropped by `selectCartProducts`.
 */
export default async function CartPage() {
  const ids = parseCartIds((await cookies()).get(CART_COOKIE_NAME)?.value);
  const catalog = await getStorefrontCatalog();
  return <CartView products={selectCartProducts(catalog.products, ids)} />;
}
