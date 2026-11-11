import { imageSources, isPlaceholder } from '@/lib/images';
import type { CatalogImage } from '@/lib/types';
import styles from './ProductPhoto.module.css';

type Props = {
  image: CatalogImage | undefined;
  /** Localized alt text. Pass an empty string for decorative images. */
  alt: string;
  /** Responsive `sizes` hint matching the layout that renders this photo. */
  sizes: string;
  loading?: 'lazy' | 'eager';
  /** `priority` images skip lazy-loading and are fetched eagerly. */
  priority?: boolean;
  className?: string;
  /** Shown when the record has no image at all. */
  fallbackLabel?: string;
  /**
   * Cropped aspect ratio of the rendered frame. Catalog photography is 3:4; a product card
   * shows a shallower 1:1 frame, which is what lets a card be shorter without shrinking any
   * text. The source files are unchanged - only the crop inside the frame is tighter.
   */
  frame?: string;
  /**
   * Draw the photograph at its **own** stored shape instead of cropping it into a frame.
   *
   * The product page uses this (owner direction, 2026-11-12): a landscape upload stays landscape and
   * nothing is cut off the sides, which is what the reference does and what a shopper checking what
   * arrives expects. Cards keep cropping - a grid needs one frame - so this is opt-in per surface and
   * never the default.
   */
  uncropped?: boolean;
};

/**
 * Single source of truth for catalog imagery. Every variant is WebP (owner direction, 2026-11-05), so
 * one `srcSet` carries 320/600/1050 and there is no second format to negotiate. Explicit width/height
 * reserve the space, so the grid never shifts while loading.
 *
 * Files are served locally rather than hotlinked, so the demo cannot break if
 * the merchant's asset CDN changes or goes offline.
 */
export function ProductPhoto({
  image,
  alt,
  sizes,
  loading = 'lazy',
  priority = false,
  className,
  fallbackLabel,
  frame,
  uncropped = false,
}: Props) {
  const shape = `${styles.img}${uncropped ? ` ${styles.uncropped}` : ''} ${className ?? ''}`.trim();

  if (!image) {
    return (
      <span
        className={`${styles.fallback} ${uncropped ? styles.fallbackUncropped : ''} ${className ?? ''}`.trim()}
        style={frame ? { aspectRatio: frame } : undefined}
      >
        {fallbackLabel ?? ''}
      </span>
    );
  }

  const sources = imageSources(image);
  const placeholder = isPlaceholder(image);

  return (
    <img
      className={shape}
      style={frame ? { aspectRatio: frame } : undefined}
      src={placeholder ? sources.fallbackSrc.replace('.webp', '.svg') : sources.fallbackSrc}
      srcSet={placeholder ? undefined : sources.webpSrcSet}
      sizes={placeholder ? undefined : sizes}
      alt={alt}
      width={sources.width}
      height={sources.height}
      loading={priority ? 'eager' : loading}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
    />
  );
}
