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
}: Props) {
  if (!image) {
    return (
      <span
        className={`${styles.fallback} ${className ?? ''}`.trim()}
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
      className={`${styles.img} ${className ?? ''} `.trim()}
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
