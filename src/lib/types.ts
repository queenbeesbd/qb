/** Domain types for the local demo catalog. See docs/catalog.md. */

import type { ProductDeliveryMinor } from './delivery';

/**
 * The interface language. English only since Phase 28: the narrower type makes a Bangla interface a
 * compile error rather than a configuration mistake. Catalog records still carry `bn` text; that is
 * data, not interface copy.
 */
export type Locale = 'en';

/** Text that may exist in one or both locales. */
export type LocalizedText = {
  bn: string | null;
  en: string | null;
};

/**
 * Prices are integer poisha (1 BDT = 100 poisha) to avoid floating-point money.
 * 750 BDT is stored as 75000.
 */
export type Money = number;

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown';

/**
 * Image rights are recorded honestly rather than assumed.
 *
 * - `merchant_source_pending_confirmation`: the file was retrieved from the
 *   retailer's own public product page and is used here for the retailer's own
 *   storefront demo, but explicit written confirmation of redistribution
 *   rights has NOT been received. See docs/catalog.md.
 * - `placeholder`: locally generated abstract artwork, no third-party rights.
 */
export type ImageRights = 'merchant_source_pending_confirmation' | 'placeholder';

export type ProductImage = {
  /**
   * Base key under `/catalog/<key>-<width>.<ext>`. Generated variants exist for
   * every entry in `IMAGE_WIDTHS`, so a broken path is a build-time error.
   */
  key: string;
  alt: LocalizedText;
  rights: ImageRights;
  /** Public product page the image was retrieved from (provenance). */
  sourcePage: string;
  /** Original asset URL as published. Recorded for provenance; never rendered. */
  sourceAsset: string;
  /** ISO date the image was retrieved from the public page. */
  retrievedAt: string;
};

export type Product = {
  id: string;
  slug: string;
  /** Merchant-published product id from the public storefront URL. */
  sourceProductId: string;
  sourceUrl: string;
  capturedAt: string;
  name: LocalizedText;
  description: LocalizedText;
  brand: string | null;
  categoryId: string;
  tags: string[];
  /**
   * Pack/size descriptor preserved from the source title (e.g. "350 ml").
   * Null when the source title does not state a pack size.
   */
  pack: string | null;
  priceMinor: Money;
  /**
   * Advertised comparison price from the public storefront where published.
   * Always greater than priceMinor when present.
   */
  compareAtPriceMinor: Money | null;
  availability: Availability;
  images: ProductImage[];
  /**
   * Verified merchant publish date. Null for every current demo record because
   * the public storefront does not expose a trustworthy date field.
   */
  addedAt: string | null;
  isDemo: true;
};

/**
 * Icon key resolved by `CategoryIcon`. `other` is the neutral fallback: the
 * database has no icon column, so an unmapped category gets a neutral glyph
 * rather than an invented association.
 */
export type CategoryIcon = 'serum' | 'hair' | 'body' | 'lip' | 'tools' | 'other';

export type Category = {
  id: string;
  slug: string;
  name: LocalizedText;
  /** Short, factual descriptor - no marketing claims. */
  blurb: LocalizedText;
  icon: CategoryIcon;
};

/**
 * Which source produced a catalog record.
 *
 * The authoritative storefront catalog is the database. The Phase 1 fixture
 * survives only as the seed input and as an explicit local-development source.
 * The two are never blended: `source` records which one produced a record, so a
 * fixture record can never be presented as a database record, or the reverse.
 */
export type CatalogSource = 'database' | 'fixture';

/**
 * Image rights as stored on a database asset. Mirrors `IMAGE_RIGHTS_STATUS` in
 * `src/db/schema/values.ts`; repeated here so client code never imports the
 * schema module.
 */
export type ImageRightsStatus = 'unknown' | 'pending_confirmation' | 'cleared' | 'restricted';

/**
 * A storefront-renderable image.
 *
 * `rights` is either the fixture's provenance marker or a database rights
 * status. Only `placeholder` changes rendering (locally generated SVG artwork);
 * a rights status never implies the image is cleared for public use.
 */
export type CatalogImage = {
  key: string;
  alt: LocalizedText;
  rights: ImageRights | ImageRightsStatus;
};

/**
 * The source-agnostic storefront catalog record.
 *
 * Both the database read layer and the fixture adapter produce this shape, so no
 * view component needs to know where a record came from. It deliberately carries
 * no fixture-only provenance (`sourceProductId`, `sourceUrl`, `tags`, capture
 * dates): a database row has none, and inventing one would be a false claim.
 */
export type CatalogItem = {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText;
  /**
   * The owner's short shelf line, rendered under the price on the product page.
   *
   * `null` means no summary was written, and the page omits the line rather than rendering an empty
   * paragraph. It is one English line by decision (Phase 35): a shelf caption, not catalog copy.
   */
  shortDescription: string | null;
  brand: string | null;
  /**
   * The brand's slug, so a product page can link to the brand it belongs to while every brand link
   * in the storefront is one `/brands/<slug>` route. `null` only when the record carries no brand.
   */
  brandSlug: string | null;
  /** Opaque identity of the record's category. */
  categoryId: string;
  /**
   * Category slug. Filtering, grouping and category links key on the slug in
   * both sources, so a listing URL never depends on a database identity value.
   */
  categorySlug: string;
  pack: string | null;
  /**
   * The product's own delivery charge per area, or nulls where the store's configured charge applies
   * (owner decision, 2026-11-10). The cart and checkout price a basket from this same snapshot.
   */
  deliveryMinor: ProductDeliveryMinor;
  priceMinor: Money;
  compareAtPriceMinor: Money | null;
  /**
   * The rating the shop displays for this product, in half stars (ADR 0035): 9 draws four and a half.
   *
   * This is the owner's own field, typed in the product editor - **not** an average of customer
   * reviews, and it is never derived from them. A database record always carries one (four stars
   * unless the owner chose another); `null` is reachable only through the captured fixture, which has
   * no rating concept, and the card then draws no stars rather than inventing four for demo data.
   */
  ratingHalves: number | null;
  availability: Availability;
  images: CatalogImage[];
  source: CatalogSource;
  /**
   * When the product was added to the catalog, as an ISO-8601 UTC instant.
   *
   * Present because the homepage publishes a "recently added" selection (D6, Phase 26) and that
   * claim must be backed by a real stored timestamp rather than an id or list position that only
   * resembles one. `null` means the source cannot state when the product was added - the fixture
   * carries no capture dates - and the homepage then shows fewer than three products rather than
   * inventing an order.
   */
  createdAt: string | null;
};

/** A storefront category, with its icon already resolved from the slug. */
export type CatalogCategory = {
  id: string;
  slug: string;
  name: LocalizedText;
  blurb: LocalizedText;
  icon: CategoryIcon;
  sortOrder: number;
  /**
   * The parent category's id, or `null` for a top-level department.
   *
   * The shop holds **one level** of subcategory (owner decision, Phase 31): a parent is always a root,
   * so this field can never point at another child. It is an id rather than a slug because the
   * category index and a parent page both need to match it without re-deriving a slug.
   */
  parentId: string | null;
  /**
   * The category's own square photograph as an asset key, or `null` when the owner has not chosen
   * one. `src/lib/images.ts` derives every rendered path from the key, so this is never a URL.
   */
  imageKey: string | null;
  /** One short English line for the category tile. `null` omits the line entirely. */
  tagline: string | null;
};

/**
 * A storefront brand.
 *
 * The brand index is a discovery surface of its own, so a brand arrives with the one fact that makes
 * a logo tile possible - its logo's asset key - plus the real product count the tile and the filter
 * both quote. `logoKey: null` means the shop has no logo for this brand, and the tile draws the
 * brand's initials rather than a placeholder pretending to be artwork.
 */
export type CatalogBrand = {
  id: string;
  slug: string;
  name: LocalizedText;
  logoKey: string | null;
  /** Published products in this brand, derived from the same snapshot the links enter. */
  productCount: number;
};

export type CartLine = {
  productId: string;
  quantity: number;
};

/**
 * Announcement strip configuration.
 *
 * Locally configured for the demo. A later authorised phase may populate this
 * from the merchant backend; no API or admin surface exists today.
 */
export type AnnouncementVariant = 'demo' | 'info';

export type Announcement = {
  id: string;
  enabled: boolean;
  /**
   * The message text. English only, like the rest of the interface (Phase 28), so the type carries
   * one string instead of two and a visible strip can never fall back to an empty line.
   */
  message: string;
  variant: AnnouncementVariant;
  /**
   * A locked announcement is rendered even when `enabled` is false. This is how
   * the demo warning survives ordinary configuration mistakes.
   */
  locked: boolean;
};
