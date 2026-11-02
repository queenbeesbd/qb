import type { CatalogImage } from './types';

/**
 * Generated image widths, in ascending order. Every `ProductImage.key` must
 * have a file for each width in both WebP and JPEG; `npm run check:catalog`
 * asserts this, so a missing asset fails the check rather than the browser.
 */
export const IMAGE_WIDTHS = [600, 1050] as const;

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
 * The aspect ratio of a product card's photo frame.
 *
 * Catalog photography is 3:4 portrait. Rendering the whole frame on every card made each card
 * ~620px tall and the homepage ~3,700px long (Phase 24 audit S-01/S-03), so the card crops to a
 * 5:4 landscape-ish frame instead: the product stays the subject, and the card buys back roughly
 * a fifth of its height without touching a single font size or touch target.
 */
export const CARD_FRAME = '5 / 4';

/*
 * The catalog listing crops taller than the homepage rows.
 *
 * It is read as a list of products rather than as one composition: a 4:5 frame gives the bottle or
 * jar the room it needs beside two lines of title, and the row height stays consistent because every
 * card in the listing uses the same frame. The homepage keeps 5:4 deliberately (see above); this is
 * an opt-in frame passed to `ProductCard`, not a change to the shared default.
 */
export const LISTING_CARD_FRAME = '4 / 5';


/**
 * The frame a category tile draws its photograph in.
 *
 * A square, because the index reads as a grid of pictures rather than a list of names: every tile is
 * the same shape at every width, so the grid scans down the screen instead of chasing the eye across
 * cards of different heights.
 */
export const CATEGORY_TILE_FRAME = '1 / 1';

/** Source-size hints for the category grid: two columns on a phone, up to seven on a wide desktop. */
export const CATEGORY_TILE_SIZES = '(max-width: 599px) 46vw, (max-width: 1023px) 22vw, 200px';

/** Source-size hints for the homepage's horizontal category rail. */
export const CATEGORY_RAIL_SIZES = '96px';

/**
 * Source-size hint for the homepage's offer shelf.
 *
 * The shelf is not the product grid: it shows 1.6 cards on a phone and four on a desktop, so a card
 * is 62vw / 44vw / 30vw / ~300px rather than a grid track. Using the grid's hint here would make the
 * browser download a source roughly twice the size of the box it fills.
 */
export const SHELF_CARD_SIZES = '(max-width: 479px) 62vw, (max-width: 719px) 44vw, (max-width: 1023px) 30vw, 300px';

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

export type ImageSources = {
  webpSrcSet: string;
  jpgSrcSet: string;
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
  width: (typeof IMAGE_WIDTHS)[number] = IMAGE_WIDTHS[0],
): string {
  return `/catalog/${key}-${width}.jpg`;
}

function buildSrcSet(key: string, extension: 'webp' | 'jpg'): string {
  return IMAGE_WIDTHS.map((width) => `/catalog/${key}-${width}.${extension} ${width}w`).join(', ');
}

/**
 * Derives every rendered image path for one catalog image. Paths are computed
 * from the key rather than stored, so a record cannot drift from its assets.
 */
export function imageSources(image: CatalogImage): ImageSources {
  return {
    webpSrcSet: buildSrcSet(image.key, 'webp'),
    jpgSrcSet: buildSrcSet(image.key, 'jpg'),
    fallbackSrc: `/catalog/${image.key}-${IMAGE_WIDTHS[0]}.jpg`,
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
