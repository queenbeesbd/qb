/** Domain types for the local demo catalog. See docs/catalog.md. */

export type Locale = 'bn' | 'en';

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

export type Category = {
  id: string;
  slug: string;
  name: LocalizedText;
  /** Short, factual descriptor - no marketing claims. */
  blurb: LocalizedText;
  /** Icon key resolved by the category icon component. */
  icon: 'serum' | 'hair' | 'body' | 'lip' | 'tools';
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
   * Both locales are required. A visible strip can therefore never fall back to
   * an untranslated or empty message.
   */
  message: { bn: string; en: string };
  variant: AnnouncementVariant;
  /**
   * A locked announcement is rendered even when `enabled` is false. This is how
   * the demo warning survives ordinary configuration mistakes.
   */
  locked: boolean;
};
