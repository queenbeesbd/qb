import type { LocalizedText, Product } from '@/lib/types';

const CAPTURED_AT = '2026-10-11';
const RIGHTS_PENDING = 'pending_review' as const;

/**
 * Deterministic local placeholder. Product photography from the public
 * storefront is NOT redistributed by this demo pending image rights review, so
 * every record points at a generated placeholder file instead of a remote URL.
 */
function placeholder(id: string): string {
  return `/catalog/${id}.svg`;
}

function text(en: string | null, bn: string | null): LocalizedText {
  return { en, bn };
}

function money(bdt: number): number {
  return Math.round(bdt * 100);
}

type Draft = {
  slug: string;
  sourceProductId: string;
  nameEn: string;
  nameBn: string | null;
  descriptionEn: string | null;
  descriptionBn: string | null;
  brand: string | null;
  categoryId: string;
  tags: string[];
  pack: string | null;
  priceBdt: number;
  compareAtBdt: number | null;
  featured: boolean;
};

/**
 * Verified demo records. Every price, brand, name and availability value below
 * was read from the public product page structured data or listing on
 * 2026-10-11. Comparison prices come from the storefront's own published
 * "Save BDT" pairs. Nothing here is inferred, and unverified fields
 * (descriptions, arrival dates, variant groups, stock counts) stay null.
 */
const drafts: Draft[] = [
  {
    slug: 'lilac-5-niacinamide-serum-30-ml',
    sourceProductId: '1449672',
    nameEn: 'Lilac 5% Niacinamide Serum 30 ml',
    nameBn: 'লিলাক ৫% নিয়াসিনামাইড সিরাম ৩০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Lilac',
    categoryId: 'skincare',
    tags: ['serum'],
    pack: '30 ml',
    priceBdt: 750,
    compareAtBdt: null,
    featured: true,
  },
  {
    slug: 'dabo-rice-ferment-foam-100ml',
    sourceProductId: '633301',
    nameEn: 'Dabo Rice Ferment Foam 100ml',
    nameBn: 'ডাবো রাইস ফারমেন্ট ফোম ১০০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Dabo',
    categoryId: 'skincare',
    tags: ['cleanser'],
    pack: '100ml',
    priceBdt: 650,
    compareAtBdt: null,
    featured: true,
  },
  {
    slug: 'the-derma-plus-kojic-acid-daily-facewash-100ml',
    sourceProductId: '859526',
    nameEn: 'The Derma Plus Kojic Acid Daily Facewash 100ml',
    nameBn: 'দ্য ডার্মা প্লাস কোজিক অ্যাসিড ডেইলি ফেসওয়াশ ১০০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'The Derma Plus',
    categoryId: 'skincare',
    tags: ['cleanser'],
    pack: '100ml',
    priceBdt: 325,
    compareAtBdt: null,
    featured: false,
  },
  {
    slug: 'innsaei-hyaluronic-sunscreen-50ml',
    sourceProductId: '572547',
    nameEn: 'innsaei Hyaluronic Sunscreen 50ml',
    nameBn: 'ইনসাই হায়ালুরনিক সানস্ক্রিন ৫০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'innsaei',
    categoryId: 'skincare',
    tags: ['sunscreen'],
    pack: '50ml',
    priceBdt: 690,
    compareAtBdt: null,
    featured: true,
  },
  {
    slug: 'skin-o-hydration-boost-gel-moisturizer-70ml',
    sourceProductId: '642304',
    nameEn: "Skin'O Hydration Boost Gel Moisturizer 70ml",
    nameBn: 'স্কিন’ও হাইড্রেশন বুস্ট জেল ময়েশ্চারাইজার ৭০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: "Skin'O",
    categoryId: 'skincare',
    tags: ['moisturizer'],
    pack: '70ml',
    priceBdt: 390,
    compareAtBdt: null,
    featured: false,
  },
  {
    slug: 'bioaqua-collagen-firming-good-night-mask',
    sourceProductId: '1422355',
    nameEn: 'BIOAQUA Collagen Firming Good Night Mask',
    nameBn: 'বায়োঅ্যাকুয়া কোলাজেন ফার্মিং গুড নাইট মাস্ক',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'BIOAQUA',
    categoryId: 'skincare',
    tags: ['mask'],
    pack: null,
    priceBdt: 40,
    compareAtBdt: 80,
    featured: false,
  },
  {
    slug: 'laikou-hydrating-milk-mud-mask-5g',
    sourceProductId: '1422285',
    nameEn: 'LAIKOU Hydrating Milk Mud Mask 5g',
    nameBn: 'লাইকো হাইড্রেটিং মিল্ক মাড মাস্ক ৫ গ্রাম',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'LAIKOU',
    categoryId: 'skincare',
    tags: ['mask'],
    pack: '5g',
    priceBdt: 30,
    compareAtBdt: 40,
    featured: false,
  },
  {
    slug: 'earth-beauty-hydrasilk-conditioner-with-argan-oil-keratin-350-ml',
    sourceProductId: '1453328',
    nameEn: 'Earth Beauty Hydrasilk Conditioner with Argan Oil + Keratin 350 ml',
    nameBn: 'আর্থ বিউটি হাইড্রাসিল্ক কন্ডিশনার (আরগান অয়েল ও কেরাটিন) ৩৫০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Earth Beauty & You',
    categoryId: 'haircare',
    tags: ['conditioner'],
    pack: '350 ml',
    priceBdt: 499,
    compareAtBdt: null,
    featured: true,
  },
  {
    slug: 'earth-beauty-restore-repair-shampoo-with-honey-infused-350-ml',
    sourceProductId: '1453300',
    nameEn: 'Earth Beauty Restore Repair Shampoo with Honey Infused 350 ml',
    nameBn: 'আর্থ বিউটি রিস্টোর রিপেয়ার শ্যাম্পু (হানি ইনফিউজড) ৩৫০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Earth Beauty & You',
    categoryId: 'haircare',
    tags: ['shampoo'],
    pack: '350 ml',
    priceBdt: 399,
    compareAtBdt: null,
    featured: false,
  },
  {
    slug: 'chaoba-hair-mask-500ml',
    sourceProductId: '1421979',
    nameEn: 'Chaoba Hair Mask 500ml',
    nameBn: 'চাওবা হেয়ার মাস্ক ৫০০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Chaoba',
    categoryId: 'haircare',
    tags: ['hair-mask'],
    pack: '500ml',
    priceBdt: 1150,
    compareAtBdt: 1250,
    featured: false,
  },
  {
    slug: 'mamaearth-onion-hair-oil-100ml',
    sourceProductId: '1422075',
    nameEn: 'Mamaearth Onion Hair Oil 100ml',
    nameBn: 'মামাআর্থ অনিয়ন হেয়ার অয়েল ১০০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Mamaearth',
    categoryId: 'haircare',
    tags: ['hair-oil'],
    pack: '100ml',
    priceBdt: 650,
    compareAtBdt: 750,
    featured: false,
  },
  {
    slug: 'mamaearth-beetroot-hydraful-face-wash-100ml',
    sourceProductId: '1422101',
    nameEn: 'Mamaearth Beetroot Hydraful Face Wash 100ml',
    nameBn: 'মামাআর্থ বিটরুট হাইড্রাফুল ফেস ওয়াশ ১০০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Mamaearth',
    categoryId: 'skincare',
    tags: ['cleanser'],
    pack: '100ml',
    priceBdt: 480,
    compareAtBdt: 550,
    featured: false,
  },
  {
    slug: 'body-brightening-combo-rajkonna-brightening-body-lotion-the-derma-plus-kojic-acid-body-wash',
    sourceProductId: '1421950',
    nameEn:
      'Body Combo (Rajkonna Body Lotion, The Derma Plus Kojic Acid Body Wash)',
    nameBn: 'বডি কম্বো (রাজকন্যা বডি লোশন, দ্য ডার্মা প্লাস কোজিক অ্যাসিড বডি ওয়াশ)',
    descriptionEn: null,
    descriptionBn: null,
    brand: null,
    categoryId: 'bodycare',
    tags: ['combo'],
    pack: null,
    priceBdt: 830,
    compareAtBdt: 900,
    featured: false,
  },
  {
    slug: 'oriox-tinted-lipbalm-strawberry',
    sourceProductId: '1421895',
    nameEn: 'Oriox Tinted Lipbalm (Strawberry)',
    nameBn: 'ওরিওক্স টিন্টেড লিপবাম (স্ট্রবেরি)',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Oriox',
    categoryId: 'lipcare',
    tags: ['lip-balm'],
    pack: null,
    priceBdt: 350,
    compareAtBdt: 420,
    featured: true,
  },
  {
    slug: 'oriox-tinted-lipbalm-cherry',
    sourceProductId: '1421892',
    nameEn: 'Oriox Tinted Lipbalm (Cherry)',
    nameBn: 'ওরিওক্স টিন্টেড লিপবাম (চেরি)',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Oriox',
    categoryId: 'lipcare',
    tags: ['lip-balm'],
    pack: null,
    priceBdt: 350,
    compareAtBdt: 420,
    featured: false,
  },
  {
    slug: 'exfoliating-shower-gloves-1pair',
    sourceProductId: '1422056',
    nameEn: 'Exfoliating Shower Gloves 1 pair',
    nameBn: 'এক্সফোলিয়েটিং শাওয়ার গ্লাভস ১ জোড়া',
    descriptionEn: null,
    descriptionBn: null,
    brand: null,
    categoryId: 'accessories',
    tags: ['tools'],
    pack: null,
    priceBdt: 290,
    compareAtBdt: 350,
    featured: false,
  },
];

const SLUG_SUFFIX = /-\d{5,}$/;

function toProduct(draft: Draft): Product {
  const slug = `${draft.slug}${SLUG_SUFFIX.test(draft.slug) ? '' : ''}`;
  return {
    id: draft.sourceProductId,
    slug,
    sourceProductId: draft.sourceProductId,
    sourceUrl: `https://queenbees.sellbd.shop/products/${draft.slug}-${draft.sourceProductId}`,
    capturedAt: CAPTURED_AT,
    name: text(draft.nameEn, draft.nameBn),
    description: text(draft.descriptionEn, draft.descriptionBn),
    brand: draft.brand,
    categoryId: draft.categoryId,
    tags: draft.tags,
    pack: draft.pack,
    priceMinor: money(draft.priceBdt),
    compareAtPriceMinor: draft.compareAtBdt === null ? null : money(draft.compareAtBdt),
    availability: 'in_stock',
    images: [
      {
        sourceUrl: 'https://queenbees.sellbd.shop/',
        localPath: placeholder(draft.slug),
        alt: text(draft.nameEn, draft.nameBn),
        rights: RIGHTS_PENDING,
      },
    ],
    addedAt: null,
    featured: draft.featured,
    isDemo: true,
  };
}

export const products: Product[] = drafts.map(toProduct);

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function getProductById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

export function getProductBySourceId(sourceProductId: string): Product | undefined {
  return products.find((product) => product.sourceProductId === sourceProductId);
}

export const demoCatalogMeta = {
  capturedAt: CAPTURED_AT,
  source: 'https://queenbees.sellbd.shop/',
  /**
   * Availability is reported as published by the public storefront on the
   * capture date. It is never a live inventory promise.
   */
  availabilityBasis: 'public_listing_snapshot' as const,
};
