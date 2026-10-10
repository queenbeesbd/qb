# Demo catalog: provenance, schema and limitations

Status: implemented for the Phase 1 frontend demonstration. Source of truth in code: `src/data/catalog.ts`, `src/data/categories.ts`, types in `src/lib/types.ts`.

## Collection method

Collected 2026-10-11 from the public storefront `https://queenbees.sellbd.shop/` using bounded read-only HTTP extraction of public product pages and the public homepage listing. No merchant backend, authenticated area, account, cart, order or payment endpoint was accessed. No customer data was collected. Collection was limited to 16 representative products, not the full catalog.

Each record stores its own `sourceUrl` and `capturedAt`, and the product detail page renders that source link so the origin of the data is visible to the client.

## Verified fields

Read from public structured data (`Product` JSON-LD) and the storefront's published listing:

| Field | Source | Notes |
| --- | --- | --- |
| `name.en` | JSON-LD `name` / listing title | Published product name, casing normalised for display |
| `sourceProductId` | Storefront product URL | Merchant-published id, not assumed to be a merchant SKU |
| `brand` | JSON-LD `brand.name` | `null` where the storefront publishes none (two records) |
| `priceMinor` | JSON-LD `offers.price` | Converted to integer poisha |
| `compareAtPriceMinor` | Listing "Save BDT" pair | Only where the storefront published both prices |
| `availability` | JSON-LD `offers.availability` | Snapshot at capture date, `in_stock` for all current records |
| `pack` | Parsed from the published title | Only where the title states a size; otherwise `null` |
| `categoryId` | Reviewed grouping | Presentational grouping by our taxonomy, not the merchant's |

## Deliberately empty fields

These are `null` rather than invented, and the UI states the gap in plain language:

- `description.bn` / `description.en` - the public storefront publishes no product description for these records. The product page says so instead of generating copy.
- `addedAt` - no reliable date-added field is published, so **no "recently added" product list is rendered**. The homepage shows an explicit explanation instead.
- Stock quantity, variant groups, option-specific pricing, ratings, reviews, sales counts, delivery promises, and authenticity claims - none are collected or displayed.

## Bangla names

The storefront publishes product names in English only. Bangla names in the catalog are **transliterations/localisations of the English product name prepared for this demo**, not merchant-published Bangla content. Brand and ingredient words (Lilac, Dabo, Niacinamide, Argan, Keratin) are intentionally preserved. These strings are clearly marked in code comments and must be reviewed by a competent Bangla speaker, and replaced by merchant copy if the merchant publishes it. The language fallback rule is documented in `docs/decisions/0002-bilingual-content-strategy.md`.

## Money representation

All prices are integer **poisha** (1 BDT = 100 poisha); `750` BDT is stored as `75000`. No floating-point arithmetic is used for money. Discount amount and percentage are always derived from stored values, never stored, and the percentage is floored so it can never overstate a saving.

## Image rights - unresolved limitation

**Public visibility is not a licence.** The storefront's product photographs are hosted on the merchant's asset CDN and were not redistributed by this demo.

- Every product record points at a locally generated SVG placeholder under `public/catalog/<slug>.svg`, tagged `rights: 'pending_review'` in the data.
- Placeholders are abstract product silhouettes with initials and the literal label "Placeholder image". They are clearly identified on the product page.
- The original `sourceUrl` is retained per record so authorised assets can be substituted later without touching components.
- **Required before any client-facing or public launch with real photography:** written permission from the retailer/manufacturer or the photographer, recorded per asset, plus a decision on attribution. Until then the placeholder set stays.

No Ghorer Bazar asset, logo, category illustration or copy was used at any point.

## Categories

Five reviewed categories: Skincare, Haircare, Bodycare, Lip care, Accessories. These group the verified sample; they are not a claim about the merchant's own taxonomy. Distribution in the demo sample is uneven (Skincare 6, Haircare 4, Bodycare 1, Lip care 2, Accessories 1), which is why the listing page carries filters and why no empty category page is fabricated.

## Backend replacement path

The UI consumes products only through the typed accessors in `src/data/catalog.ts` (`getProductBySlug`, `getProductById`, `products`). Because components depend on the `Product` type rather than the fixture module, an authorised backend adapter can replace these accessors without rewriting the storefront. Any future adapter must still be validated server-side for price, stock and availability before it is trusted.

## Verification

`npm run check:catalog` asserts unique ids/slugs, positive integer prices, comparison price greater than current price, known category ids, at least one localized name, and that every referenced local image exists on disk.
