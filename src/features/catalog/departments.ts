import type { CatalogCategory, CatalogItem } from '@/lib/types';

/**
 * How many departments the storefront shows before it defers to the full index.
 *
 * Four is the owner's number (2026-10-23) and it is also what the header can hold: the imported
 * catalog has fifteen departments, and an unbounded row ran the navigation under the search field
 * and widened every page past the viewport.
 */
export const DEPARTMENTS_SHOWN = 4;

/**
 * The departments worth showing first: the ones holding the most products.
 *
 * Ordering by count rather than by the vendor's serial keeps the header honest about this shop. The
 * catalog's own order puts Accessories, Bodycare, Perfume Oil and Lipstick first, which describes
 * nothing; Skincare (652 products), MakeUp Products, Hair Care and Bodycare are what the shop is
 * actually made of. Ties fall back to the declared order and then the slug, so the same catalog always
 * produces the same four.
 */
export function selectDepartments(
  categories: readonly CatalogCategory[],
  products: readonly CatalogItem[],
  limit: number = DEPARTMENTS_SHOWN,
): CatalogCategory[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const slug = product.categorySlug;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return [...categories]
    .map((category) => ({ category, count: counts.get(category.slug) ?? 0 }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.category.sortOrder - b.category.sortOrder ||
        a.category.slug.localeCompare(b.category.slug),
    )
    .slice(0, limit)
    .map((entry) => entry.category);
}
