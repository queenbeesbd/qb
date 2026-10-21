/** Domain types for the local demo catalog. See docs/catalog.md. */

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
  /** Opaque identity of the record's category. */
  categoryId: string;
  /**
   * Category slug. Filtering, grouping and category links key on the slug in
   * both sources, so a listing URL never depends on a database identity value.
   */
  categorySlug: string;
  pack: string | null;
  priceMinor: Money;
  compareAtPriceMinor: Money | null;
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
