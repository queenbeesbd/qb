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
}: {
  children: React.ReactNode;
  density?: 'full' | 'sidebar';
}) {
  const count = Children.count(children);
  return (
    <ul
      className={styles.grid}
      data-density={density}
      data-count-odd={count % 2 === 1 ? 'true' : undefined}
    >
      {Children.map(children, (child, index) => (
        <li key={index}>{child}</li>
      ))}
    </ul>
  );
}
