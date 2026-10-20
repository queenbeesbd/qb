import styles from './ProductGrid.module.css';

/**
 * Shared responsive product grid so every collection aligns consistently.
 *
 * `density="sidebar"` is for a grid that sits beside a filter column. Those surfaces lose
 * ~240px of track width, so they take their column count one breakpoint later than a
 * full-width grid: five columns in a sidebar layout at 1440px would leave ~144px cards,
 * which is narrower than the phone grid. Default (`full`) is for homepage, category and
 * related-product rows that have the whole container.
 *
 * `density="trio"` is for a row that publishes a **fixed count of three** (the homepage
 * "Recently added" selection). A `full` grid would place three cards in a four- or five-column
 * track and leave the remaining columns empty, so the row reads as an unfinished carousel and
 * every card stretches wider than the cards above it. Three explicit columns keep the row full
 * at its own width and the cards the same size as their neighbours.
 */
export function ProductGrid({
  children,
  density = 'full',
}: {
  children: React.ReactNode;
  density?: 'full' | 'sidebar' | 'trio';
}) {
  return (
    <ul className={styles.grid} data-density={density}>
      {children}
    </ul>
  );
}
