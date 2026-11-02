import { imageSources } from '@/lib/images';
import styles from './DiscoveryPhoto.module.css';

/**
 * A category photograph or a brand logo, rendered through the same asset contract as product
 * photography: a `<picture>` with a WebP source set, a JPEG fallback and an explicit square frame, so
 * the grid reserves its space and nothing shifts while the images arrive.
 *
 * The fallback is the point of this component. A category with no photograph drawn shows its icon over
 * the category's tinted surface; a brand with no logo shows the brand's initials. Both are honest -
 * "this shop has no picture of this yet" - and both keep their tile the same size as its neighbours, so
 * one missing image cannot break the grid's rhythm.
 */
export function DiscoveryPhoto({
  /** The asset key under `/catalog/`, or `null` when the owner has not chosen an image. */
  imageKey,
  alt,
  sizes,
  /** Decorative images (the tile already names itself) pass an empty `alt`. */
  className,
  priority = false,
  fallback = 'glyph',
}: {
  imageKey: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  /** What to draw when there is no image: the category's icon, or the brand's initials. */
  fallback?: 'glyph' | React.ReactNode;
}) {
  if (imageKey === null) {
    return (
      <span className={`${styles.fallback} ${className ?? ''}`.trim()} aria-hidden="true">
        {fallback === 'glyph' ? null : fallback}
      </span>
    );
  }

  /*
   * The same source set product photography uses. A discovery image is an ordinary catalog asset, so
   * it renders through the same contract - local file first, object storage otherwise - and no
   * provider URL exists anywhere in the storefront.
   */
  const sources = imageSources({ key: imageKey, alt: { bn: null, en: null }, rights: 'unknown' });
  return (
    <picture className={`${styles.picture} ${className ?? ''}`.trim()}>
      <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />
      <img
        className={styles.img}
        src={sources.fallbackSrc}
        srcSet={sources.jpgSrcSet}
        sizes={sizes}
        alt={alt}
        /* The intrinsic ratio only; CSS decides the rendered size, so a 72px tile is 72px tall. */
        width={480}
        height={480}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
      />
    </picture>
  );
}

/**
 * A brand mark: the logo when the shop has one, and the brand's initials when it does not.
 *
 * The initials are derived from the name the shop stores - never invented - and set on the brand's own
 * tint, so a row of logos and a row of initials still reads as one consistent set of tiles.
 */
export function BrandMark({
  logoKey,
  name,
  slug,
  sizes,
  priority = false,
}: {
  logoKey: string | null;
  name: string;
  slug: string;
  sizes: string;
  priority?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span className={styles.brandMark} data-tone={toneFor(slug)}>
      <DiscoveryPhoto
        imageKey={logoKey}
        alt=""
        sizes={sizes}
        priority={priority}
        className={styles.brandLogo}
        fallback={<span className={styles.brandInitials}>{initials || '·'}</span>}
      />
    </span>
  );
}

/**
 * One of four tints, chosen from the slug so a brand keeps the same tile colour on every visit while
 * neighbouring tiles differ. Presentational only: it never carries meaning the name does not.
 */
function toneFor(slug: string): string {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return String(hash % 4);
}
