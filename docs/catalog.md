# Demo catalog: provenance, imagery and limitations

Status: authentic product photography integrated in Phase 2 (2026-10-11). Source of truth in code: `src/data/catalog.ts`, `src/data/categories.ts`, `src/data/announcements.ts`, types in `src/lib/types.ts`, image helpers in `src/lib/images.ts`.

## Collection method

Collected 2026-10-11 from the public storefront `https://queenbees.sellbd.shop/` using bounded read-only HTTP requests to public product pages. No merchant backend, authenticated area, account, cart, order or payment endpoint was accessed. No customer data was collected. Collection was limited to the 16 representative products already in the demo, not the full catalog.

Each record stores `sourceUrl`, `capturedAt`, and per-image `sourcePage` plus `sourceAsset`, and the product page renders the source link so the origin of the data is visible.

## Verified fields

Read from public `Product` JSON-LD and the storefront's published listing:

| Field | Source | Notes |
| --- | --- | --- |
| `name.en` | JSON-LD `name` | Published product name |
| `sourceProductId` | Storefront product URL | Merchant-published id, not assumed to be a SKU |
| `brand` | JSON-LD `brand.name` | `null` where the storefront publishes none (two records) |
| `priceMinor` | JSON-LD `offers.price` | Converted to integer poisha |
| `compareAtPriceMinor` | Listing "Save BDT" pair | Only where the storefront published both prices |
| `availability` | JSON-LD `offers.availability` | Snapshot at capture date |
| `pack` | Parsed from the published title | Only where the title states a size |
| `categoryId` | Reviewed grouping | Our taxonomy, not the merchant's |
| `images[].sourceAsset` | JSON-LD `image[]` | Original asset URL, recorded for provenance |

## Product photography (Phase 2)

### What was done

For each of the 16 demo products, the primary image URL was read from the product page's public `Product` JSON-LD on 2026-10-11 and downloaded once into the repository. Images are **served locally** from `public/catalog/`, never hotlinked, so the demo cannot break if the merchant's asset CDN changes.

One product (Chaoba Hair Mask) has a second gallery image, also retrieved and stored as `<slug>-2`.

### Derived assets

Every image is stored at two widths in two formats, all cropped to a consistent **3:4 portrait** ratio:

| Variant | Size | Purpose |
| --- | --- | --- |
| `<slug>-600.webp` | 600x800 | Card grid (primary source) |
| `<slug>-600.jpg` | 600x800 | Card grid fallback |
| `<slug>-1050.webp` | 1050x1400 | Product detail (primary source) |
| `<slug>-1050.jpg` | 1050x1400 | Product detail fallback |

All source images were natively portrait and were normalised to exactly 3:4, so the grid never letterboxes or crops product labels. `src/lib/images.ts` computes every path from the image `key` rather than storing paths, and `npm run check:catalog` asserts all 68 files exist.

Rendering goes through one shared `ProductPhoto` component: a `<picture>` with a WebP `source`, a JPEG fallback, explicit `width`/`height` (so the layout never shifts while loading), `sizes` hints matching the responsive grid, and `loading="lazy"` everywhere except the product detail hero, which is eager with `fetchPriority="high"`.

### Honest characterisation of the imagery

These are the merchant's own lifestyle photographs, not studio packshots. Observed characteristics, recorded because they affect how the storefront reads:

- Shot on green banana-leaf backgrounds, outdoors, or on white fur - the backdrop is **not** uniform across the catalog.
- Many show a black-gloved hand holding the product.
- Some carry a `QUEENBEES` watermark or a small branded thank-you card in frame.
- Native resolution varies from 720x960 to 3024x4032.

This is disclosed rather than hidden. It is why the product grid uses a consistent 3:4 crop and a neutral surface behind each image: the framing is made consistent even though the photography is not.

### Rights status - unresolved limitation

**Public availability does not establish permission to redistribute.** The images were retrieved from the retailer's own public product pages and are used here for that same retailer's own storefront demonstration, which is the most defensible reading available - but **explicit written confirmation of redistribution rights has not been received**.

- Every image is tagged `rights: 'merchant_source_pending_confirmation'` in the data. This is deliberately not `cleared`.
- Each record keeps `sourcePage` (the public product page) and `sourceAsset` (the original asset URL) plus `retrievedAt`, so provenance is auditable per image.
- The product detail page shows a short source note under the photo.
- **Required before any public launch or wider redistribution:** written permission from QueenBee's covering use of this photography on this storefront, recorded per asset, plus a decision on whether the watermark-bearing images are acceptable as-is or should be replaced with the merchant's clean originals.

If a replacement is needed, only `src/data/catalog.ts` (the provenance map) and the files in `public/catalog/` change - no component reads a hardcoded path.

No Ghorer Bazar asset, logo, illustration or copy was used at any point. No stock photography and no AI-generated product imagery was introduced.

### Fallback behaviour

Locally generated abstract SVG placeholders remain in `public/catalog/<slug>.svg` and are still supported: a record with no verified photography, or one tagged `rights: 'placeholder'`, renders the placeholder and a caption instead of a broken image. `ProductPhoto` handles the missing-image case with a labelled fallback box. No product is ever padded with an unrelated image.

## Deliberately empty fields

`null` rather than invented, and the UI states the gap in plain language:

- `description.bn` / `description.en` - the public storefront publishes no product description for these records. The product page says so instead of generating copy.
- `addedAt` - no reliable date-added field is published, so **no "recently added" product list is rendered**; the homepage explains why.
- Stock quantity, variant groups, option-specific pricing, ratings, reviews, sales counts, delivery promises and authenticity claims - none are collected or displayed.

## Bangla names

The storefront publishes product names in English only. Bangla names in the catalog are **transliterations prepared for this demo**, not merchant-published Bangla content. Brand and ingredient words (Lilac, Dabo, Niacinamide, Argan, Keratin) are preserved. These require native review and should be replaced by merchant copy if it is ever published. Fallback policy: `docs/decisions/0002-bilingual-content-strategy.md`.

## Money representation

All prices are integer **poisha** (1 BDT = 100 poisha); 750 BDT is stored as `75000`. No floating-point arithmetic is used for money. Discount amount and percentage are always derived, never stored, and the percentage is floored so it cannot overstate a saving.

## Categories

Five reviewed categories: Skincare, Haircare, Bodycare, Lip care, Accessories. These group the verified sample and are not a claim about the merchant's own taxonomy. Distribution is uneven (Skincare 6, Haircare 4, Bodycare 1, Lip care 2, Accessories 1), which is why the listing carries filters and why no empty category page is fabricated.

## Backend replacement path

The UI consumes products only through the typed accessors in `src/data/catalog.ts` (`products`, `getProductBySlug`, `getProductById`). Because components depend on the `Product` type and `ProductPhoto`, an authorised backend adapter can replace the fixtures - including image URLs - without rewriting the storefront. Any future adapter must still be validated server-side for price, stock and availability before it is trusted.

## Verification

`npm run check:catalog` asserts: unique ids/slugs; positive integer prices; comparison price greater than current; known category ids; at least one localized name; per-image alt text, provenance page, provenance asset URL and retrieval date; and that every declared image variant exists on disk. It also asserts that the locked demo announcement is present and active.
