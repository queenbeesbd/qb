import { starFills } from '@/lib/rating';
import styles from './RatingStars.module.css';

/**
 * Five stars, filled to the rating.
 *
 * The star geometry is drawn here rather than set in a glyph font, so a half star is exact: the empty
 * star is filled in the muted star tone and the filled half is a polygon covering precisely its left
 * side, which needs no mask, no clip id and no painted-over background. A glyph font would round the
 * half to whichever character it happens to ship.
 *
 * Colour is never the only signal: `role="img"` with the caller's label states the rating in words,
 * and the shapes differ (filled, half, empty) under it. That is what makes the row survive a
 * greyscale render and a screen reader.
 *
 * No hooks, no client boundary of its own: the row is presentational, and the components that use it
 * decide whether they are interactive.
 */
export function RatingStars({
  halves,
  size = 'sm',
  label,
  className,
}: {
  /** The rating in half stars: 2 = one star, 9 = four and a half, 10 = five. */
  halves: number;
  /** `sm` for a product card (11px stars), `md` for a product page (15px stars). */
  size?: 'sm' | 'md';
  /** The rating in words, e.g. "Rated 4.5 out of 5". Required: the stars alone are not announced. */
  label: string;
  className?: string;
}) {
  const fills = starFills(halves);

  return (
    <span
      className={className === undefined ? styles.row : `${styles.row} ${className}`}
      data-size={size}
      role="img"
      aria-label={label}
    >
      {fills.map((fill, index) => (
        <svg
          // Position is the identity here: the row is five fixed slots, never reordered or keyed.
          key={index}
          className={styles.star}
          data-fill={fill}
          viewBox="0 0 24 24"
          width="1em"
          height="1em"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className={styles.empty}
            d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z"
          />
          {fill === 'full' && (
            <path
              className={styles.filled}
              d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z"
            />
          )}
          {fill === 'half' && (
            /*
             * Exactly the left half of the same outline: the top point, the centre-bottom point, and
             * the three left vertices. Its edge is the star's own vertical axis, so the join between
             * the two tones is a clean straight line rather than a stepped approximation.
             */
            <path
              className={styles.filled}
              d="M12 2.6v14.8l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"
            />
          )}
        </svg>
      ))}
    </span>
  );
}
