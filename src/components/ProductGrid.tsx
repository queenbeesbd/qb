import styles from './ProductGrid.module.css';

/** Shared responsive product grid so every collection aligns consistently. */
export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <ul className={styles.grid}>{children}</ul>;
}
