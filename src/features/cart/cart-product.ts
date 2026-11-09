import type { ProductDeliveryMinor } from '@/lib/delivery';
import type {
  Availability,
  CatalogItem,
  ImageRights,
  ImageRightsStatus,
  Money,
} from '@/lib/types';

/**
 * What a cart line actually renders, and nothing else.
 *
 * The storefront layout used to hand the **whole catalog record** to the browser cart, which after the
 * import meant 1,477 products with their descriptions, localised image alt text and source metadata in
 * every page's payload - about 2.0 MB of HTML per route. A cart line needs a name, a price, a picture
 * and an availability state; this is that shape, and the payload is roughly a quarter of the original.
 *
 * The cart is not a second catalog: it never searches, filters or sorts, so the fields a listing needs
 * (description, short description, category, source, timestamps) are deliberately absent.
 */
export type CartProduct = {
  id: string;
  slug: string;
  /** The display name, already resolved. The interface is English-only, so a cart line has one name. */
  name: string;
  brand: string | null;
  pack: string | null;
  /** The product's own delivery charge per area, which the checkout quote may use. */
  deliveryMinor: ProductDeliveryMinor;
  priceMinor: Money;
  compareAtPriceMinor: Money | null;
  availability: Availability;
  imageKey: string | null;
  imageRights: ImageRights | ImageRightsStatus;
};

/** Projects a catalog record down to what the cart renders. */
export function toCartProduct(item: CatalogItem): CartProduct {
  return {
    id: item.id,
    slug: item.slug,
    // The storefront is single-language, so the resolved name is the whole name.
    name: item.name.en ?? item.name.bn ?? item.slug,
    brand: item.brand,
    pack: item.pack,
    deliveryMinor: item.deliveryMinor,
    priceMinor: item.priceMinor,
    compareAtPriceMinor: item.compareAtPriceMinor,
    availability: item.availability,
    imageKey: item.images[0]?.key ?? null,
    // No image is not a placeholder rights value: 'unknown' is the honest state, and it keeps a real
    // product from being labelled as placeholder artwork.
    imageRights: item.images[0]?.rights ?? 'unknown',
  };
}

export function toCartProducts(items: readonly CatalogItem[]): CartProduct[] {
  return items.map(toCartProduct);
}

/**
 * The projection a **cart page** needs: the products named by the cart's mirrored ids, in the order
 * the customer added them, and nothing else.
 *
 * This is the whole of Phase 45b. Before it, `/cart` and `/checkout` passed all 1,477 products so a
 * line could be resolved after a client-side change; now the page asks the cookie which ids exist and
 * projects those five, so the payload tracks the basket rather than the shop.
 *
 * An id that the catalog no longer contains is **dropped**, not projected as a blank row: the cart
 * store already refuses such a line, and the page must not invent a product to keep a slot. Duplicate
 * ids cannot reach here - `parseCartIds` de-duplicates them - but the lookup is by id either way.
 */
export function selectCartProducts(
  items: readonly CatalogItem[],
  ids: readonly string[],
): CartProduct[] {
  if (ids.length === 0) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const selected: CartProduct[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item !== undefined) selected.push(toCartProduct(item));
  }
  return selected;
}
