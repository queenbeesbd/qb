import type { Metadata } from 'next';
import { CategoriesView } from '@/features/catalog/CategoriesView';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

export const metadata: Metadata = { title: 'Categories' };
export const dynamic = 'force-dynamic';

/**
 * Category index. Counts are derived from the same catalog snapshot the cards link into, so a category
 * can never advertise a number the listing does not show.
 */
export default async function CategoriesPage() {
  const catalog = await getStorefrontCatalog();
  const byId = new Map(catalog.categories.map((category) => [category.id, category]));
  const counts: Record<string, number> = {};
  for (const product of catalog.products) {
    counts[product.categorySlug] = (counts[product.categorySlug] ?? 0) + 1;
    /*
     * A department's tile states what browsing it shows, and a department page now includes its
     * subcategories. The parent's tile therefore counts its children's products too; the child's own
     * page keeps its direct listing.
     */
    const category = byId.get(product.categoryId);
    const parent = category?.parentId === null || category?.parentId === undefined
      ? null
      : byId.get(category.parentId);
    if (parent !== null && parent !== undefined) {
      counts[parent.slug] = (counts[parent.slug] ?? 0) + 1;
    }
  }

  /*
   * Brands are no longer passed: they have their own page (owner decision, 2026-11-02) and this
   * index answers only the department question. A brand teaser here duplicated /brands and made the
   * shopper choose a browsing direction before knowing what either held.
   */
  return <CategoriesView categories={catalog.categories} counts={counts} />;
}
