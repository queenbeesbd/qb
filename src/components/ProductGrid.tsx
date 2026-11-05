import { Children } from 'react';
import styles from './ProductGrid.module.css';

/**
 * Shared responsive product grid so every collection aligns consistently.
 *
 * `density="sidebar"` is for a grid that sits beside a filter column. Those surfaces lose ~290px of
 * track width, so they take their own, denser scale: the catalog listing is read row by row, while the
 * homepage grid is a composition.
 *
 * Each card is wrapped in an `<li>`, because this is a list of products: a `<ul>` may not hold
 * `<article>` directly, and the wrapper is what the grid's own track rules (and the odd-count span
 * below) act on.
 *
 * **The last card spans the row when the count is odd - on a phone only.** A two-column phone grid with
 * an odd number of products ends on one card and one empty track, which reads as a broken layout rather
 * than a short selection. The count is measured here rather than left to CSS, because a stylesheet
 * cannot know how many children it was given. From 720px the grid holds three or more columns, so a
 * short final row is an ordinary grid, not a hole, and the span rule is scoped to the phone width.
 */
export function ProductGrid({
  children,
  density = 'full',
  oddLast = 'stretch',
  className,
}: {
  children: React.ReactNode;
  density?: 'full' | 'sidebar';
  /*
   * What the spanning last card does with its width.
   *
   * 'stretch' (the default) is the homepage composition: the card is the same portrait card as its
   * neighbours, one column wider. 'wide' turns that card into two columns - photograph on the left at
   * a normal card's width, body beside it - which is what a related-products row needs, because there
   * the spanning card drew a 343x451 card with a 273px-tall photograph next to 165x309 siblings. It is
   * opt-in so the homepage rows are untouched.
   */
  oddLast?: 'stretch' | 'wide';
  /**
   * A caller's own class on the list, for the one thing a shared grid cannot decide: how many cards
   * a named section shows at a given width. The homepage uses it to draw four featured cards and
   * eight browse cards on a phone - an even count fills the two-column grid - while the desktop rows
   * stay five across.
   */
  className?: string;
}) {
  const count = Children.count(children);
  return (
    <ul
      className={className === undefined ? styles.grid : `${styles.grid} ${className}`}
      data-density={density}
      data-count-odd={count % 2 === 1 ? 'true' : undefined}
      data-odd-last={oddLast}
    >
      {Children.map(children, (child, index) => (
        <li key={index}>{child}</li>
      ))}
    </ul>
  );
}
