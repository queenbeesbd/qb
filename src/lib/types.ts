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

export type ImageRights = 'pending_review' | 'placeholder';

export type ProductImage = {
  /** Absolute source URL (public storefront) - never rendered directly. */
  sourceUrl: string;
  /** Locally generated, deterministic placeholder derived from sourceUrl. */
  localPath: string;
  alt: LocalizedText;
  rights: ImageRights;
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
  /**
   * Explicit demo curation flag. Never a claim about sales, popularity,
   * merchant recommendation, or real arrival order.
   */
  featured: boolean;
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
