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
};

/**
 * Single source of truth for catalog imagery. Emits a `<picture>` with a WebP
 * source set, a JPEG fallback, and explicit width/height so the browser reserves
 * space and the grid never shifts while loading.
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
}: Props) {
  if (!image) {
    return (
      <span className={`${styles.fallback} ${className ?? ''}`.trim()}>
        {fallbackLabel ?? ''}
      </span>
    );
  }

  const sources = imageSources(image);
  const placeholder = isPlaceholder(image);

  return (
    <picture className={`${styles.picture} ${className ?? ''} `.trim()}>
      {!placeholder && (
        <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />
      )}
      <img
        className={styles.img}
        src={placeholder ? sources.fallbackSrc.replace('.jpg', '.svg') : sources.fallbackSrc}
        srcSet={placeholder ? undefined : sources.jpgSrcSet}
        sizes={placeholder ? undefined : sizes}
        alt={alt}
        width={sources.width}
        height={sources.height}
        loading={priority ? 'eager' : loading}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    </picture>
  );
}
