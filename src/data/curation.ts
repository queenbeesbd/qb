import { getProductById } from './catalog';
import type { Product } from '@/lib/types';

/**
 * Explicit demo curation.
 *
 * Both selections reference stable product ids instead of duplicating product
 * objects, so a curated entry can never drift from the price, pack size or
 * photography of the product it points at. `npm run check:catalog` fails if an
 * id is unknown, if a list repeats an id, if the two lists overlap, or if a list
 * exceeds its cap.
 *
 * A later authorised phase may let the merchant choose these from the backend.
 * No API, schema or admin surface exists today, and none is assumed here.
 */

/** Hard cap on the featured shelf. Four are visible at once on wide viewports. */
export const FEATURED_MAX = 6;

/** Cap on the "more to explore" collection. */
export const COLLECTION_MAX = 8;

/**
 * Featured shelf selection: one product per care category where possible, so
 * the shelf never reads as a single-category shelf.
 */
export const FEATURED_PRODUCT_IDS: readonly string[] = [
  '1449672', // Lilac 5% Niacinamide Serum 30 ml - skincare
  '1421979', // Chaoba Hair Mask 500ml - haircare
  '1421950', // Body Combo - bodycare
  '1421895', // Oriox Tinted Lipbalm (Strawberry) - lip care
  '1422056', // Exfoliating Shower Gloves 1 pair - accessories
  '572547', // innsaei Hyaluronic Sunscreen 50ml - skincare
];

/**
 * "More to explore" selection. The products added to the catalog in the current
 * phase lead, then two established entries. It is chosen so that no product
 * appears both here and on the offer row, which keeps the homepage from showing
 * the same card twice.
 */
export const COLLECTION_PRODUCT_IDS: readonly string[] = [
  '1422095', // Mamaearth Vitamin C Daily Glow Face Wash 100ml
  '1422353', // BIOAQUA Hydrating & Moisture Aloe Vera Mask
  '1422242', // LAIKOU Sakura Mud Mask 5g
  '1422350', // SADOER Composite Acid Carrot Foam Mask
  '1453323', // Earth Beauty Glosse Shampoo 350 ml
  '1453306', // Earth Beauty Anti Hairfall Shampoo 350 ml
  '859526', // The Derma Plus Kojic Acid Daily Facewash 100ml
  '633301', // Dabo Rice Ferment Foam 100ml
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
