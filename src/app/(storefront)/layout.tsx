import { CartProvider } from '@/features/cart/CartProvider';
import { getStorefrontCatalog } from '@/server/catalog/storefront';
import { Shell } from '../Shell';

/**
 * Storefront chrome: announcement strip, header, footer, and the cart provider.
 *
 * The cart lives here rather than in the root layout because it is storefront state only - the admin
 * surface has no cart, and a provider it does not use would still subscribe to `localStorage` on
 * every admin page. `LocaleProvider` is in the root layout, because the admin surface is bilingual
 * too.
 *
 * The catalog is read once here (the loader is `cache`-wrapped, so the page and its metadata share
 * this single snapshot) and only plain serializable values are handed to the client components: the
 * header and footer receive categories, and the cart provider receives the products it resolves ids
 * against.
 *
 * `force-dynamic` is deliberate: the storefront renders a live catalog, so it must never be served
 * from a build-time static render.
 */
export const dynamic = 'force-dynamic';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const catalog = await getStorefrontCatalog();

  return (
    <CartProvider products={catalog.products}>
      <Shell categories={catalog.categories}>{children}</Shell>
    </CartProvider>
  );
}
