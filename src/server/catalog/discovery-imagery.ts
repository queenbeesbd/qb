#!/usr/bin/env tsx
/**
 * Discovery imagery: the licence list and the asset builder for category photographs and brand logos.
 *
 * Two surfaces in the storefront now show a picture that is not a product photograph - the category
 * index and the brand rail - and both must be honest about where the picture came from. This module is
 * the single source for that: the hand-picked category photographs with their licence, and the
 * documented rule for a brand logo.
 *
 * ## Category photographs
 *
 * Each category's photograph is a real, licensed stock image from Unsplash, chosen by eye against the
 * category it illustrates and recorded here with its photographer, its source page and its licence.
 * Unsplash's licence grants free commercial use without attribution; the credit is recorded anyway,
 * because an image whose origin nobody can find again is not one this project may ship.
 *
 * The shop still owns the final word: `category.image_key` is what the storefront renders, and the
 * admin editor can replace any of these with the shop's own photograph. This list exists so the
 * redesign is not a wall of icon glyphs on day one - not to stop the owner changing their mind.
 *
 * ## Brand logos
 *
 * A brand logo is not picked by hand (245 of them would be a month of work) and it is not fetched at
 * request time either: a third-party hotlink would put another site in the customer's page load, break
 * whenever that site changes, and put a request in someone else's log for every visitor. So a small,
 * resumable command (`npm run assets:brands`) asks DuckDuckGo's icon service for each brand's own
 * published favicon, re-encodes it to a square PNG and stores it under `brand-logo-<slug>`.
 *
 * That is deliberately a **logo**, not artwork: the favicon is the mark the brand itself publishes for
 * its site, and nothing is generated, recoloured or redrawn. A brand with no usable icon is left with
 * `logo_key = null`, and the tile falls back to the brand's initials - a stated gap rather than a
 * substitute logo that would put the wrong mark on the wrong name.
 *
 * Brand logos are third-party trademarks, used here to identify the goods the shop sells; they are not
 * licensed from the brands and are not presented as QueenBee's own artwork.
 */

/** One generated image variant, in the shape `public/catalog` already uses. */
export type AssetVariantSet = {
  /** `/catalog/<key>-<width>.webp` and `.jpg` are written for each width. */
  readonly widths: readonly number[];
};

/**
 * The widths every discovery image is generated at.
 *
 * **The same two product photography uses**, and that is the point. A category photograph and a brand
 * logo are ordinary catalog images: they live in `public/catalog`, are uploaded to the same bucket and
 * are served by the same `/catalog/<key>-<width>.<ext>` route with the same inventory allowlist. A
 * third width family would need its own route predicate, its own completeness check and its own path
 * builder - three places to drift - and would make an image the owner chose for a category unusable as
 * a product photograph. The tile's `sizes` hint keeps the browser from taking a source it cannot show.
 */
export const DISCOVERY_WIDTHS = [600, 1050] as const;

/**
 * The category photographs, one per visible category, with provenance.
 *
 * `id` is the Unsplash photo id, which is what the photographer's page hangs off: the source URL is
 * `https://unsplash.com/photos/<id>`. `subject` records what the picture actually shows, so a future
 * reader can tell whether the tile still matches the category rather than trusting the filename.
 */
export const CATEGORY_PHOTOS: Readonly<
  Record<string, { readonly id: string; readonly subject: string; readonly credit: string }>
> = {
  skincare: {
    id: '1580870069867-74c57ee1bb07',
    subject: 'Four skincare bottles and jars on a pale surface with pink flower petals',
    credit: 'Unsplash photo 1580870069867-74c57ee1bb07',
  },
  'makeup-products': {
    id: '1583209814683-c023dd293cc6',
    subject: 'Pink cosmetic containers, a tube and a brush arranged on a pale background',
    credit: 'Unsplash photo 1583209814683-c023dd293cc6',
  },
  'hair-care': {
    id: '1747858989102-cca0f4dc4a11',
    subject: 'A shampoo bottle on a plain neutral background',
    credit: 'Unsplash photo 1747858989102-cca0f4dc4a11',
  },
  bodycare: {
    id: '1619451334792-150fd785ee74',
    subject: 'Hands holding a jar of body cream',
    credit: 'Unsplash photo 1619451334792-150fd785ee74',
  },
  perfume: {
    id: '1615108395437-df128ad79e80',
    subject: 'A clear glass perfume bottle among white flowers',
    credit: 'Unsplash photo 1615108395437-df128ad79e80',
  },
  'perfume-oil': {
    id: '1693960794637-42e1cf5baa0b',
    subject: 'A small perfume bottle beside a second bottle',
    credit: 'Unsplash photo 1693960794637-42e1cf5baa0b',
  },
  lipstick: {
    id: '1625093742435-6fa192b6fb10',
    subject: 'A red lipstick open beside its cap on a white surface',
    credit: 'Unsplash photo 1625093742435-6fa192b6fb10',
  },
  mascara: {
    id: '1758738880203-8968fb4eda82',
    subject: 'A mascara tube with its wand and flowers',
    credit: 'Unsplash photo 1758738880203-8968fb4eda82',
  },
  eyeliner: {
    id: '1595550912256-b24059bb08e8',
    subject: 'A close-up of an eyeliner wing drawn on an eye',
    credit: 'Unsplash photo 1595550912256-b24059bb08e8',
  },
  'face-powder-loose-compact': {
    id: '1590156424570-698d124ec7dd',
    subject: 'An open compact of pressed powder pans',
    credit: 'Unsplash photo 1590156424570-698d124ec7dd',
  },
  'facial-mask': {
    id: '1570172619644-dfd03ed5d881',
    subject: 'A face mask being applied during a spa treatment',
    credit: 'Unsplash photo 1570172619644-dfd03ed5d881',
  },
  accessories: {
    id: '1583784561105-a674080f391e',
    subject: 'Assorted make-up brushes laid out on a grey surface',
    credit: 'Unsplash photo 1583784561105-a674080f391e',
  },
  bags: {
    id: '1598532163257-ae3c6b2524b6',
    subject: 'A brown leather handbag on a white surface',
    credit: 'Unsplash photo 1598532163257-ae3c6b2524b6',
  },
  jewelery: {
    id: '1617038220319-276d3cfab638',
    subject: 'Gold twisted hoop earrings on white stones',
    credit: 'Unsplash photo 1617038220319-276d3cfab638',
  },
};

/**
 * The storefront's category tiles, in the order a shopper meets them.
 *
 * A category list ordered by the vendor's serial number describes nothing: it began with
 * Accessories, Bodycare and Perfume Oil. This is the order a cosmetics shop is browsed in - face,
 * then makeup, then hair and body, then scent, then accessories - and it is the order the shop's own
 * `sortOrder` column then keeps. Only categories this list names are renumbered; anything the owner
 * adds later keeps the order the admin gave it.
 */
export const CATEGORY_DISPLAY_ORDER: readonly string[] = [
  'skincare',
  'makeup-products',
  'lipstick',
  'face-powder-loose-compact',
  'eyeliner',
  'mascara',
  'facial-mask',
  'hair-care',
  'bodycare',
  'perfume',
  'perfume-oil',
  'accessories',
  'bags',
  'jewelery',
];

/**
 * One short line per category, shown under its name on the index.
 *
 * These are descriptions of what the department holds, not claims: no "best", no "sale", no promise.
 * The owner can edit any of them in the admin, and a blank tagline simply omits the line.
 */
export const CATEGORY_TAGLINES: Readonly<Record<string, string>> = {
  skincare: 'Cleansers, serums and moisturizers',
  'makeup-products': 'Foundation, blush and setting sprays',
  lipstick: 'Bullet, liquid and gloss',
  'face-powder-loose-compact': 'Pressed and loose powder',
  eyeliner: 'Pencils, pens and liquid liner',
  mascara: 'Lengthening and volumizing',
  'facial-mask': 'Sheet, clay and overnight masks',
  'hair-care': 'Shampoo, treatment and oil',
  bodycare: 'Lotion, scrub and deodorant',
  perfume: 'Eau de parfum and body mists',
  'perfume-oil': 'Concentrated attar and roll-ons',
  accessories: 'Brushes, tools and gloves',
  bags: 'Pouches and vanity bags',
  jewelery: 'Earrings, rings and necklaces',
};

/** The Unsplash download URL for one photograph, cropped square at a generous master size. */
export function categoryPhotoUrl(id: string, size = 1200): string {
  return `https://images.unsplash.com/photo-${id}?w=${size}&h=${size}&fit=crop&crop=entropy&q=85&fm=jpg`;
}

/** The asset key a category photograph is stored under. Matches the `category_image_key_format` check. */
export function categoryImageKey(slug: string): string {
  return `category-${slug}`;
}

/** The asset key a brand logo is stored under. */
export function brandLogoKey(brandSlug: string): string {
  return `brand-logo-${brandSlug}`;
}

/**
 * Official domains, recorded only where they were checked by hand.
 *
 * A guessed domain is a guess, and the first pass proved how bad a guess can be: `dabo.com` is a
 * parked domain for sale, so its "favicon" is a registrar's placeholder. A wrong mark on the right
 * name is worse than no mark at all, so a brand on this list is here **because the domain was opened
 * and its own page named the brand** - `aplb.co.kr` leads with "APLB", `anua.com` with "Anua", and so
 * on. Everything else falls through to the generated candidates and to the same verification.
 */
export const OFFICIAL_BRAND_DOMAINS: Readonly<Record<string, string>> = {
  aplb: 'aplb.co.kr',
  anua: 'anua.com',
  'beauty-of-joseon': 'beautyofjoseon.com',
  'chemist-at-play': 'chemistatplay.com',
  cosrx: 'cosrx.com',
  'dot-key': 'dotandkey.com',
  flormar: 'flormar.com',
  laikou: 'laikou.com',
  mamaearth: 'mamaearth.in',
  'skin-1004': 'skin1004.com',
  'swiss-beauty': 'swissbeauty.in',
  'the-derma-plus': 'thedermaplus.com',
  wishcare: 'wishcare.in',
};

/**
 * A plausible brand domain, in order of preference.
 *
 * DuckDuckGo's icon service takes a domain, not a name, so a name has to become a domain. A recorded
 * official domain is tried first; then a short list of guessed suffixes, each of which still has to
 * pass the title check in the build command before its icon is used. A brand whose sites are all
 * unknown keeps `logo_key = null` and shows its initials - the honest outcome, and the one the
 * storefront states in its own copy.
 */
export function brandDomainCandidates(brandSlug: string): string[] {
  const flat = brandSlug.replace(/-/g, '');
  const official = OFFICIAL_BRAND_DOMAINS[brandSlug];
  const guesses = [
    `${flat}.com`,
    `${brandSlug}.com`,
    `${flat}.in`,
    `${flat}.bd`,
    `${flat}.net`,
    `${flat}.co`,
    `${flat}.org`,
    `${flat}official.com`,
    `${flat}bd.com`,
  ];
  return official === undefined ? guesses : [official, ...guesses.filter((domain) => domain !== official)];
}
