import { getProductById } from './catalog';
import type { Product } from '@/lib/types';

/**
 * The owner's curated selections.
 *
 * Both selections reference stable product ids instead of duplicating product
 * objects, so a curated entry can never drift from the price, pack size or
 * photography of the product it points at. `npm run check:catalog` fails if an
 * id is unknown, if a list repeats an id, if the two lists overlap, or if a list
 * exceeds its cap.
 *
 * A later authorised phase may let the owner choose these from the backend.
 * No API, schema or admin surface exists today, and none is assumed here.
 *
 * **2026-10-23:** the homepage renders both. "Featured products" publishes the featured list as one row
 * of five, and "More to explore" leads with the collection before continuing into the rest of the
 * catalog, so neither list holds ids the page never shows.
 */

/**
 * Hard cap on the featured row: exactly the one row of five the homepage publishes.
 *
 * Five rather than six because the row has no controls any more (owner decision, 2026-10-23). A sixth id
 * would be curation nobody sees - the featured row renders one complete row and nothing else.
 */
export const FEATURED_MAX = 5;

/**
 * Cap on the curated lead of the "more to explore" browse row.
 *
 * The row itself holds up to ten products (two desktop rows), but only the first five are the owner's
 * choice; the rest continue into the catalog. Five keeps every curated id visible near the front instead
 * of burying it behind products the shop did not pick.
 */
export const COLLECTION_MAX = 5;

/**
 * Featured row: one product per care department, so the row reads as the shop's range rather than as a
 * single-category shelf. Five departments, five products.
 */
export const FEATURED_PRODUCT_IDS: readonly string[] = [
  '1449672', // Lilac 5% Niacinamide Serum 30 ml - skincare
  '1421979', // Chaoba Hair Mask 500ml - haircare
  '1421950', // Body Combo - bodycare
  '1421895', // Oriox Tinted Lipbalm (Strawberry) - lip care
  '1422056', // Exfoliating Shower Gloves 1 pair - accessories
];

/**
 * "More to explore" curation: the shop's own pick of established products, shown first in the browse row.
 *
 * **Revised 2026-10-23.** The list used to lead with the six newest products - the same six "Recently
 * added" already publishes - so rendering it would have shown the page the same cards twice. Recency
 * owns those six, and the collection now holds established entries. None of them publishes a comparison
 * price, which leaves every discounted product to the derived offer row and keeps that row complete.
 */
export const COLLECTION_PRODUCT_IDS: readonly string[] = [
  '642304', // Skin'O Hydration Boost Gel Moisturizer 70ml - skincare
  '859526', // The Derma Plus Kojic Acid Daily Facewash 100ml - skincare
  '633301', // Dabo Rice Ferment Foam 100ml - skincare
  '1453328', // Earth Beauty Hydrasilk Conditioner with Argan Oil + Keratin 350 ml - haircare
  '1453300', // Earth Beauty Restore Repair Shampoo with Honey Infused 350 ml - haircare
];

/**
 * Resolves ids to catalog records.
 *
 * Unknown ids are dropped rather than thrown on, so a stale configuration
 * degrades to a shorter list instead of a broken page. The cap is applied here
 * as well as in the content check, so the limit holds even if the check is
 * bypassed.
 */
export function resolveSelection(ids: readonly string[], max: number): Product[] {
  return ids
    .slice(0, max)
    .map((id) => getProductById(id))
    .filter((product): product is Product => Boolean(product));
}
