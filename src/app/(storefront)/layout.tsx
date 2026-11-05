import { activeAnnouncements } from '@/data/announcements';
import type { AnnouncementItem } from '@/components/AnnouncementBar';
import { withTransaction } from '@/db/client';
import { CartProvider } from '@/features/cart/CartProvider';
import { selectDepartments } from '@/features/catalog/departments';
import { loadAnnouncement } from '@/server/settings/announcement';
import { getStorefrontCatalog } from '@/server/catalog/storefront';
import { currentCustomerPrincipal } from '@/server/customer-auth/guard';
import { Shell } from '../Shell';

/**
 * Storefront chrome: announcement strip, header, footer, and the cart provider.
 *
 * The cart lives here rather than in the root layout because it is storefront state only - the admin
 * surface has no cart, and a provider it does not use would still subscribe to `localStorage` on
 * every admin page.
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
  /**
   * The header states whether a customer is signed in, so the session is resolved here on the
   * server and only the two fields the header can display cross the boundary. `currentCustomerPrincipal`
   * is `cache`-wrapped, so a page that needs the same principal a second time reuses this read.
   */
  const principal = await currentCustomerPrincipal();
  /**
   * Announcements are composed here (Phase 28). The locked preview notice always leads; the owner's
   * message follows only when it is saved and switched on. Reading it on the server means a database
   * failure surfaces through the error boundary instead of silently dropping the preview notice.
   */
  /*
   * One ordering rule for every navigation surface: the departments holding the most products come
   * first, because the imported catalog's own order puts Accessories and Bags above Skincare's 652.
   * The header shows the first four, the footer the first five, and both end with the index.
   */
  const byDepartmentSize = selectDepartments(
    catalog.categories,
    catalog.products,
    catalog.categories.length,
  );

  const saved = await withTransaction((tx) => loadAnnouncement(tx));
  const announcements: AnnouncementItem[] = activeAnnouncements().map((item) => ({
    id: item.id,
    variant: item.variant,
    message: item.message,
  }));
  if (saved.visible && saved.message !== null) {
    announcements.push({ id: 'owner-message', variant: 'info', message: saved.message });
  }

  return (
    /*
     * The layout gives the cart what every page needs and nothing more: the ids, so a restored line is
     * validated against what the shop actually sells. The product records a line draws are supplied by
     * the two routes that render lines (/cart and /checkout), which is what keeps the whole catalog out
     * of every other page's payload.
     */
    <CartProvider productIds={catalog.products.map((product) => product.id)}>
      <Shell
        categories={byDepartmentSize}
        customer={
          principal === null ? null : { email: principal.email, displayName: principal.displayName }
        }
        announcements={announcements}
      >
        {children}
      </Shell>
    </CartProvider>
  );
}
