import type { LocalizedText, Product, ProductImage } from '@/lib/types';

const CAPTURED_AT = '2026-10-11';
const RETRIEVED_AT = '2026-10-11';

/**
 * Rights status for the authentic product photography used by this demo.
 * Retrieved from the retailer's own public product pages for the retailer's own
 * storefront demo, but NOT yet confirmed in writing. See docs/catalog.md.
 */
const RIGHTS_MERCHANT = 'merchant_source_pending_confirmation' as const;

/**
 * Verified image provenance. Every asset URL and page below was read from the
 * public product page on RETRIEVED_AT. Images are stored locally rather than
 * hotlinked so the demo cannot break when the merchant CDN changes.
 */
const IMAGE_PROVENANCE: Record<string, { primary: string; gallery: string | null; page: string }> = {
  'lilac-5-niacinamide-serum-30-ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/99/a0/1000516338-8896912979378875/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/lilac-5-niacinamide-serum-30-ml-1449672',
  },
  'dabo-rice-ferment-foam-100ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/1000319434-2912280283105681.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/dabo-rice-ferment-foam-100ml-633301',
  },
  'the-derma-plus-kojic-acid-daily-facewash-100ml': {
    primary: 'https://assets.zatiqeasy.com/inventories/1992144870348902.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/the-derma-plus-kojic-acid-daily-facewash-100ml-859526',
  },
  'innsaei-hyaluronic-sunscreen-50ml': {
    primary: 'https://assets.zatiqeasy.com/inventories/565115981654228.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/innsaei-hyaluronic-sunscreen-50ml-572547',
  },
  'skin-o-hydration-boost-gel-moisturizer-70ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/de/19/1000150362-6304180917387748/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/skin-o-hydration-boost-gel-moisturizer-70ml-642304',
  },
  'bioaqua-collagen-firming-good-night-mask': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/8f/91/1000155967-8288234473352232/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/bioaqua-collagen-firming-good-night-mask-1422355',
  },
  'laikou-hydrating-milk-mud-mask-5g': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/b9/ac/1000155974-8286547552710470/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/laikou-hydrating-milk-mud-mask-5g-1422285',
  },
  'earth-beauty-hydrasilk-conditioner-with-argan-oil-keratin-350-ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/24/0a/1000517506-8993119140836675/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/earth-beauty-hydrasilk-conditioner-with-argan-oil-keratin-350-ml-1453328',
  },
  'earth-beauty-restore-repair-shampoo-with-honey-infused-350-ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/13/2e/1000517509-8992510756076516/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/earth-beauty-restore-repair-shampoo-with-honey-infused-350-ml-1453300',
  },
  'chaoba-hair-mask-500ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/df/d4/1000156218-8284014372319640/original.jpg',
    gallery: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/7a/7e/1000156162-8283755773111602/original.jpg',
    page: 'https://queenbees.sellbd.shop/products/chaoba-hair-mask-500ml-1421979',
  },
  'mamaearth-onion-hair-oil-100ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/f9/7e/1000155965-8284448376072597/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/mamaearth-onion-hair-oil-100ml-1422075',
  },
  'mamaearth-beetroot-hydraful-face-wash-100ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/70/b6/1000156227-8284836793368412/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/mamaearth-beetroot-hydraful-face-wash-100ml-1422101',
  },
  'body-brightening-combo-rajkonna-brightening-body-lotion-the-derma-plus-kojic-acid-body-wash': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/06/57/1000156203-8283610933168212/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/body-brightening-combo-rajkonna-brightening-body-lotion-the-derma-plus-kojic-acid-body-wash-1421950',
  },
  'oriox-tinted-lipbalm-strawberry': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/b8/ab/1000156205-8283247986772764/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/oriox-tinted-lipbalm-strawberry-1421895',
  },
  'oriox-tinted-lipbalm-cherry': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/36/85/1000156204-8283457893799922/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/oriox-tinted-lipbalm-cherry-1421892',
  },
  'exfoliating-shower-gloves-1pair': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/72/e9/1000156155-8283960797579798/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/exfoliating-shower-gloves-1pair-1422056',
  },
  'bioaqua-hydrating-moisture-aloe-vera-multi-functional-mask': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/e5/18/1000155976-8288185227740264/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/bioaqua-hydrating-moisture-aloe-vera-multi-functional-mask-1422353',
  },
  'sadoer-composite-acid-carrot-foam-mask': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/fa/e3/1000155966-10268366866229029/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/sadoer-composite-acid-carrot-foam-mask-1422350',
  },
  'laikou-sakura-mud-mask-5g': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/88/76/1000155975-8286055315249868/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/laikou-sakura-mud-mask-5g-1422242',
  },
  'mamaearth-vitamin-c-daily-glow-face-wash-100ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/d3/23/1000156160-8285025508742115/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/mamaearth-vitamin-c-daily-glow-face-wash-100ml-1422095',
  },
  'earth-beauty-glosse-shampoo-with-argan-oil-amla-keratin-350-ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/d1/ff/1000517511-8992817041133098/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/earth-beauty-glosse-shampoo-with-argan-oil-amla-keratin-350-ml-1453323',
  },
  'earth-beauty-anti-hairfall-shampoo-with-biotin-caffeine-350-ml': {
    primary: 'https://assets.zatiqeasy.com/easy/uploads/42239/inventories/14/5f/1000517510-8992571427400269/original.jpg',
    gallery: null,
    page: 'https://queenbees.sellbd.shop/products/earth-beauty-anti-hairfall-shampoo-with-biotin-caffeine-350-ml-1453306',
  },
};

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
  /** Optional override used only by the placeholder branch. */
  sourcePage?: string;
};

/**
 * Verified demo records. Every price, brand, name and availability value below
 * was read from the public product page structured data or listing on
 * 2026-10-11. Comparison prices come from the storefront's own published
 * "Save BDT" pairs. Nothing here is inferred, and unverified fields
 * (descriptions, arrival dates, variant groups, stock counts) stay null.
 *
 * The featured shelf is not configured here; it is a separate id list in
 * `src/data/curation.ts`, so curation cannot drift from the product record.
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
  },

  /*
   * Added in the mobile/discovery refinement phase. Every value below was read
   * from the product's own public page on 2026-10-11: the title gives the name,
   * pack size and variant, the published "BDT x BDT y Save BDT z" line gives the
   * current and comparison price, and the page's Brand field gives the brand.
   * Where the page publishes no comparison price, compareAtBdt stays null rather
   * than being inferred from a sibling product.
   */
  {
    slug: 'bioaqua-hydrating-moisture-aloe-vera-multi-functional-mask',
    sourceProductId: '1422353',
    nameEn: 'BIOAQUA Hydrating & Moisture Aloe Vera Multi Functional Mask',
    nameBn: 'বায়োঅ্যাকুয়া হাইড্রেটিং ও ময়েশ্চার অ্যালোভেরা মাল্টি ফাংশনাল মাস্ক',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'BIOAQUA',
    categoryId: 'skincare',
    tags: ['mask'],
    pack: null,
    priceBdt: 40,
    compareAtBdt: 80,
  },
  {
    slug: 'sadoer-composite-acid-carrot-foam-mask',
    sourceProductId: '1422350',
    nameEn: 'SADOER Composite Acid Carrot Foam Mask',
    nameBn: 'সাদোয়ার কম্পোজিট অ্যাসিড ক্যারট ফোম মাস্ক',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'SADOER',
    categoryId: 'skincare',
    tags: ['mask'],
    pack: null,
    priceBdt: 40,
    compareAtBdt: 80,
  },
  {
    slug: 'laikou-sakura-mud-mask-5g',
    sourceProductId: '1422242',
    nameEn: 'LAIKOU Sakura Mud Mask 5g',
    nameBn: 'লাইকো সাকুরা মাড মাস্ক ৫ গ্রাম',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'LAIKOU',
    categoryId: 'skincare',
    tags: ['mask'],
    pack: '5g',
    priceBdt: 30,
    compareAtBdt: 60,
  },
  {
    slug: 'mamaearth-vitamin-c-daily-glow-face-wash-100ml',
    sourceProductId: '1422095',
    nameEn: 'Mamaearth Vitamin C Daily Glow Face Wash 100ml',
    nameBn: 'মামাআর্থ ভিটামিন সি ডেইলি গ্লো ফেস ওয়াশ ১০০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Mamaearth',
    categoryId: 'skincare',
    tags: ['cleanser'],
    pack: '100ml',
    priceBdt: 530,
    compareAtBdt: 550,
  },
  {
    slug: 'earth-beauty-glosse-shampoo-with-argan-oil-amla-keratin-350-ml',
    sourceProductId: '1453323',
    nameEn: 'Earth Beauty Glosse Shampoo with Argan Oil + Amla + Keratin 350 ml',
    nameBn: 'আর্থ বিউটি গ্লস শ্যাম্পু (আরগান অয়েল, আমলা ও কেরাটিন) ৩৫০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Earth Beauty & You',
    categoryId: 'haircare',
    tags: ['shampoo'],
    pack: '350 ml',
    priceBdt: 399,
    compareAtBdt: null,
  },
  {
    slug: 'earth-beauty-anti-hairfall-shampoo-with-biotin-caffeine-350-ml',
    sourceProductId: '1453306',
    nameEn: 'Earth Beauty Anti Hairfall Shampoo with Biotin + Caffeine 350 ml',
    nameBn: 'আর্থ বিউটি অ্যান্টি হেয়ারফল শ্যাম্পু (বায়োটিন ও ক্যাফেইন) ৩৫০ মিলি',
    descriptionEn: null,
    descriptionBn: null,
    brand: 'Earth Beauty & You',
    categoryId: 'haircare',
    tags: ['shampoo'],
    pack: '350 ml',
    priceBdt: 399,
    compareAtBdt: null,
  },
];

function toProduct(draft: Draft): Product {
  const provenance = IMAGE_PROVENANCE[draft.slug];
  const images: ProductImage[] = [];

  if (provenance) {
    images.push({
      key: draft.slug,
      alt: text(draft.nameEn, draft.nameBn),
      rights: RIGHTS_MERCHANT,
      sourcePage: provenance.page,
      sourceAsset: provenance.primary,
      retrievedAt: RETRIEVED_AT,
    });
    if (provenance.gallery) {
      images.push({
        key: `${draft.slug}-2`,
        alt: text(draft.nameEn, draft.nameBn),
        rights: RIGHTS_MERCHANT,
        sourcePage: provenance.page,
        sourceAsset: provenance.gallery,
        retrievedAt: RETRIEVED_AT,
      });
    }
  } else {
    images.push({
      key: draft.slug,
      alt: text(draft.nameEn, draft.nameBn),
      rights: 'placeholder',
      sourcePage: draft.sourcePage ?? 'https://queenbees.sellbd.shop/',
      sourceAsset: '',
      retrievedAt: RETRIEVED_AT,
    });
  }

  return {
    id: draft.sourceProductId,
    slug: draft.slug,
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
    images,
    addedAt: null,
    isDemo: true,
  };
}

export const products: Product[] = drafts.map(toProduct);


export function getProductById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
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
