import type { Metadata } from 'next';

import { BrandIndexView } from '@/features/catalog/BrandIndexView';
import { getStorefrontCatalog } from '@/server/catalog/storefront';

export const metadata: Metadata = { title: 'Brands' };
export const dynamic = 'force-dynamic';

/**
 * The brand index.
 *
 * Its own address because a brand is a place a customer browses from - a logo rail on the homepage
 * holds ten, and the shop carries over two hundred. The counts come from the same catalog snapshot the
 * tiles link into, so a brand tile can never advertise a number its listing does not show.
 */
export default async function BrandsPage() {
  const catalog = await getStorefrontCatalog();
  return <BrandIndexView brands={catalog.brands} />;
}
