import type { CatalogImage } from './types';

/**
 * Generated image widths, in ascending order (owner direction, 2026-11-05).
 *
 * Every key carries all three as **WebP only**; `npm run check:catalog` asserts the set. 320 is the
 * thumbnail the circular rails and small admin previews ask for, 600 is the product card and the
 * smallest full frame, and 1050 is the detail photograph. Nothing wider is stored or served: a card
 * never downloads the detail master, and a 116px circle never downloads a 600px card image.
 */
export const IMAGE_WIDTHS = [320, 600, 1050] as const;

/** The width a card or an un-srcset browser receives. */
export const IMAGE_FALLBACK_WIDTH = 600;

/**
 * Intrinsic aspect ratio of every catalog image (3:4 portrait). Declared as
 * width/height attributes so the browser reserves space and the grid never
 * shifts while images load.
 */
export const IMAGE_ASPECT = { width: 600, height: 800 } as const;

/** `sizes` hints matching the responsive grid and detail layout. */
/*
 * Must track ProductGrid's actual column count and the container cap, or the
 * browser downloads a source far larger than the rendered card. Five columns
 * inside a 1440px container top out at ~252px per card, and the cap keeps the
 * hint honest above that.
 */
export const CARD_SIZES =
  '(max-width: 719px) 50vw, (max-width: 1199px) 33vw, (max-width: 1599px) 20vw, 300px';

/**
 * The aspect ratio of a product card's photo frame: **one frame at every size and on every surface**
 * (owner direction, 2026-11-05).
 *
 * Catalog photography is 3:4 portrait. A 5:4 landscape-ish crop was tried on the homepage rows to buy
 * back height (Phase 24 audit S-01/S-03), and the owner's verdict was that it cut the product away: a
 * bottle or a jar lost its top and bottom, and a homepage card no longer matched the same product's card
 * in the listing. The single 4:5 frame below shows most of the portrait photograph, and because every
 * surface uses it, a card is the same shape whether it is seen on the homepage, in a carousel, in a
 * category or on the listing.
 */
export const CARD_FRAME = '4 / 5';

/**
 * The listing's frame, kept as its own name because the listing stylesheet reads it directly. It is the
 * same value as `CARD_FRAME` on purpose - two names for two call sites, one measurement, so the two
 * surfaces cannot drift apart again.
 */
export const LISTING_CARD_FRAME = CARD_FRAME;


/**
 * The frame a category tile draws its photograph in: **a circle** (owner direction, 2026-11-05).
 *
 * The square tile was the index's own shape and the homepage rails' circles were the shop's - two
 * vocabularies for the same subject. The index now draws the same circle the homepage does, so a
 * department looks like itself wherever it is met, and the photograph fills that circle with a centre
 * crop (`object-fit: cover`) instead of being letterboxed inside a box.
 */
export const CATEGORY_TILE_FRAME = '1 / 1';

/** Source-size hint for the circular category tiles: three across a phone, 120px circles from 1024px. */
export const CATEGORY_TILE_SIZES = '(max-width: 479px) 30vw, (max-width: 719px) 22vw, 120px';

/** Source-size hint for the homepage's horizontal category rail. */
export const CATEGORY_RAIL_SIZES = '96px';

/**
 * Source-size hint for the homepage's **circular** category carousel
 * (`CategoryCircleRail`). Five circles a phone row and 116px from 1024px; the 20vw hint covers a
 * fifth of the content width, and the 320px variant still covers a 2x phone.
 */
export const CIRCLE_RAIL_SIZES = '(max-width: 719px) 20vw, 116px';

/**
 * Source-size hint for the homepage's **circular** brand carousel (`BrandCircleRail`).
 *
 * The circle is the same 116px box the category rail draws, and the mark is inset inside it, so the
 * logo itself never renders wider than ~76px.
 */
export const BRAND_RAIL_SIZES = '(max-width: 719px) 20vw, 76px';

/** Source-size hint for the listing's four-column desktop grid. */
export const LISTING_CARD_SIZES =
  '(max-width: 719px) 50vw, (max-width: 1023px) 33vw, (max-width: 1439px) 30vw, 280px';

/**
 * Source-size hint for the product gallery.
 *
 * The media column is capped rather than filling its half of the layout (see `product.module.css`), so
 * a hint that said 45vw at every desktop width asked for a source bigger than the box it lands in.
 */
export const DETAIL_SIZES = '(max-width: 879px) 92vw, (max-width: 1199px) 40vw, 480px';

/**
 * The homepage hero carousel's generated widths (Phase 51).
 *
 * A hero banner is a 16:9 composition rather than a product photograph, so it cannot share
 * `IMAGE_WIDTHS`: 600px is too soft for a full-width banner and the two sizes below are the two the
 * generated files actually carry. `npm run assets:hero` writes both as WebP.
 */
export const HERO_IMAGE_WIDTHS = [800, 1600] as const;

/** The frame every hero banner is generated and rendered in. 1600 x 900. */
export const HERO_FRAME = '16 / 9';

/** One generated hero variant's public path, derived from its key and never stored in the database. */
export function heroImagePath(key: string, width: (typeof HERO_IMAGE_WIDTHS)[number] = 1600): string {
  return `/hero/${key}-${width}.webp`;
}

export type HeroImageSources = {
  readonly webpSrcSet: string;
  readonly fallbackSrc: string;
  readonly width: number;
  readonly height: number;
};

/**
 * Cache-busting token on every rendered catalog path (2026-11-05).
 *
 * `/catalog/<key>-<width>.<ext>` is answered with a redirect to the configured storage bucket, and
 * browsers had cached that redirect as immutable for a year. When the deployment moved to a different
 * Neon branch, every already-cached redirect kept sending the browser to the old bucket, which the
 * Content-Security-Policy no longer allows - the site rendered with empty image frames and nothing in
 * the database was wrong. The redirect is no longer cached for a year (see the route), but a cached
 * entry cannot be recalled, so the URL itself has to change once. Bump this when the storage origin
 * moves again; the query never reaches the bucket, and local files ignore it.
 */
export const CATALOG_ASSET_VERSION = '4';

/** One catalog asset path, versioned. The key names bytes that never change; the version names where. */
function catalogPath(file: string): string {
  return `/catalog/${file}?v=${CATALOG_ASSET_VERSION}`;
}

/**
 * Every rendered path for one hero image, derived from its key.
 *
 * The same contract product imagery uses: the database holds a key, this function builds the paths,
 * and `public/hero` / object storage serve them. No provider URL is ever stored as a banner's
 * identity.
 */
export function heroImageSources(key: string): HeroImageSources {
  const build = (): string =>
    HERO_IMAGE_WIDTHS.map((width) => `/hero/${key}-${width}.webp ${width}w`).join(', ');
  return {
    webpSrcSet: build(),
    fallbackSrc: heroImagePath(key),
    width: 1600,
    height: 900,
  };
}

export type ImageSources = {
  webpSrcSet: string;
  fallbackSrc: string;
  width: number;
  height: number;
};

/**
 * One generated variant's path, derived from the key.
 *
 * The admin list and the media panel need a single URL rather than a source set. Deriving it here keeps
 * the rule that a rendered path comes from the record's key and never from a stored URL - and it means
 * the two admin surfaces cannot disagree about which width they ask for.
 */
export function imageVariantPath(
  key: string,
  width: (typeof IMAGE_WIDTHS)[number] = IMAGE_FALLBACK_WIDTH,
): string {
  return catalogPath(`${key}-${width}.webp`);
}

function buildSrcSet(key: string): string {
  return IMAGE_WIDTHS.map((width) => `${catalogPath(`${key}-${width}.webp`)} ${width}w`).join(', ');
}

/**
 * Derives every rendered image path for one catalog image. Paths are computed
 * from the key rather than stored, so a record cannot drift from its assets.
 */
export function imageSources(image: CatalogImage): ImageSources {
  return {
    webpSrcSet: buildSrcSet(image.key),
    fallbackSrc: catalogPath(`${image.key}-${IMAGE_FALLBACK_WIDTH}.webp`),
    width: IMAGE_ASPECT.width,
    height: IMAGE_ASPECT.height,
  };
}

/**
 * True when the key points at locally generated placeholder artwork rather
 * than authentic product photography. Used to label the image honestly.
 */
export function isPlaceholder(image: CatalogImage): boolean {
  return image.rights === 'placeholder';
}
