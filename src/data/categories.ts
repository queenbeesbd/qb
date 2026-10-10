import type { Category } from '@/lib/types';

/**
 * Reviewed demo taxonomy for the cosmetics catalog. See docs/catalog.md.
 * Categories are presentational groupings of verified products, not claims
 * about the merchant's own category structure.
 */
export const categories: Category[] = [
  {
    id: 'skincare',
    slug: 'skincare',
    name: { bn: 'স্কিন কেয়ার', en: 'Skincare' },
    blurb: {
      bn: 'সিরাম, ময়েশ্চারাইজার, সানস্ক্রিন ও ফেসওয়াশ',
      en: 'Serums, moisturisers, sunscreen and face wash',
    },
    icon: 'serum',
  },
  {
    id: 'haircare',
    slug: 'haircare',
    name: { bn: 'হেয়ার কেয়ার', en: 'Haircare' },
    blurb: {
      bn: 'শ্যাম্পু, কন্ডিশনার, হেয়ার মাস্ক ও হেয়ার অয়েল',
      en: 'Shampoo, conditioner, hair mask and hair oil',
    },
    icon: 'hair',
  },
  {
    id: 'bodycare',
    slug: 'bodycare',
    name: { bn: 'বডি কেয়ার', en: 'Bodycare' },
    blurb: {
      bn: 'বডি লোশন ও বডি ওয়াশ',
      en: 'Body lotion and body wash',
    },
    icon: 'body',
  },
  {
    id: 'lipcare',
    slug: 'lipcare',
    name: { bn: 'লিপ কেয়ার', en: 'Lip care' },
    blurb: {
      bn: 'টিন্টেড লিপবাম ও লিপ কেয়ার',
      en: 'Tinted lip balm and lip care',
    },
    icon: 'lip',
  },
  {
    id: 'accessories',
    slug: 'accessories',
    name: { bn: 'অ্যাকসেসরিজ', en: 'Accessories' },
    blurb: {
      bn: 'স্কিন কেয়ার টুলস ও অ্যাকসেসরিজ',
      en: 'Skincare tools and accessories',
    },
    icon: 'tools',
  },
];

export function getCategory(id: string): Category | undefined {
  return categories.find((category) => category.id === id);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}
