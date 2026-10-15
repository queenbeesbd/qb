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
 * browser downloads a source far larger than the rendered card. Four columns
 * inside a 1440px container top out at ~322px per card.
 */
export const CARD_SIZES = '(max-width: 719px) 50vw, (max-width: 1023px) 33vw, 330px';
export const DETAIL_SIZES = '(max-width: 879px) 100vw, 45vw';

export type ImageSources = {
  webpSrcSet: string;
  jpgSrcSet: string;
  fallbackSrc: string;
  width: number;
  height: number;
};

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
