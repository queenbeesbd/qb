import type { Metadata } from 'next';
import { HomeView } from '@/features/catalog/HomeSections';

export const metadata: Metadata = {
  title: 'QueenBee’s — যত্নে বাছাই করা কসমেটিকস',
};

/**
 * Homepage. All product content is derived from the local verified demo
 * catalog, so no fabricated marketing claim can appear here.
 */
export default function HomePage() {
  return <HomeView />;
}
