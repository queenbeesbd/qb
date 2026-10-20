import styles from './ProductGrid.module.css';

/**
 * Shared responsive product grid so every collection aligns consistently.
 *
 * `density="sidebar"` is for a grid that sits beside a filter column. Those surfaces lose
 * ~240px of track width, so they take their column count one breakpoint later than a
 * full-width grid: five columns in a sidebar layout at 1440px would leave ~144px cards,
 * which is narrower than the phone grid. Default (`full`) is for homepage, category and
 * related-product rows that have the whole container.
 */
export function ProductGrid({
  children,
  density = 'full',
}: {
  children: React.ReactNode;
  density?: 'full' | 'sidebar';
}) {
  return (
    <ul className={styles.grid} data-density={density}>
      {children}
    </ul>
  );
}
