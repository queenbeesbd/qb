import { CartProvider } from '@/features/cart/CartProvider';
import { Shell } from '../Shell';

/**
 * Storefront chrome: announcement strip, header, footer, and the cart provider.
 *
 * The cart lives here rather than in the root layout because it is storefront state only - the admin
 * surface has no cart, and a provider it does not use would still subscribe to `localStorage` on
 * every admin page. `LocaleProvider` is in the root layout, because the admin surface is bilingual
 * too.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Shell>{children}</Shell>
    </CartProvider>
  );
}
