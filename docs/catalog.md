# Catalog provenance

Status: 22 products, 5 categories. Last expanded 2026-10-11.

## Product imagery in the admin (Phase 13)

**Association only, from assets already in the repository.** Phase 13 added an image surface that attaches an existing
`public/catalog/<key>-<width>.<ext>` set to a product:

- the key is validated against a **server-controlled inventory** derived by listing `public/catalog` itself, so a key
  that is not a real, complete asset is refused, and a path-shaped or URL-shaped value cannot even be expressed
  (format check first, allowlist second);
- `content_type`, `width`, `height` and `byte_size` are read from the **file bytes** - the magic number and the JPEG
  SOF / WebP VP8 header - never from the request and never from the extension. A file named `.jpg` whose bytes are
  WebP is recorded as WebP;
- bilingual alt text is required in at least one language, matching the rule `npm run check:catalog` already applies
  to this catalog;
- `rights_status` is written as `pending_confirmation`, because the photography is the Phase 1 demo set and its rights
  remain unresolved. Recording it as `cleared` would be a claim we cannot support, and the schema requires a note for
  that value anyway;
- `product_image.base_key` is globally unique, so **one asset belongs to at most one product**. Attaching a key that
  another product holds is refused with an explanation rather than sharing the asset.

**Deferred, and not implemented:** upload, object storage (D3), derivative generation from an uploaded file, image
replacement or deletion of the underlying bytes, and the optional category image mark. The `product_image_derivative`
rows written here describe the variants that already exist on disk; nothing generates them.

## Why the catalog is local

The storefront reads a typed local fixture (`src/data/catalog.ts`). Nothing is fetched at runtime. This keeps the demo deterministic, keeps every claim traceable to a captured source, and means a backend adapter can replace the data layer later without rewriting components. That adapter is now planned rather than hypothetical - see `docs/platform-architecture.md` and `docs/migration-plan.md`.

## Source and capture

| Field | Value |
| --- | --- |
| Source | `https://queenbees.sellbd.shop/` |
| Capture date | 2026-10-11 |
| Method | Public product pages and listing pages, read as rendered HTML |
| Merchant backend | Read-only audit in Phase 7 (`docs/backend-capability-audit.md`). No write, no order, no customer record, no credential exposed |

Every price, name, brand, pack size and comparison price is a value the storefront itself publishes. Where a field is not published, it is stored as `null` and the interface states the gap instead of filling it.

### How each field was verified

| Field | Source on the public page |
| --- | --- |
| Name | Product page title, and the listing card title |
| Price / comparison price | The published `BDT x BDT y Save BDT z` line |
| Brand | The page's `Brand` field |
| Pack size | Stated in the product title where present; otherwise `null` |
| Category | Assigned from the product's own type of care, not from a merchant taxonomy |
| Availability | The listing's published state on the capture date |
| Description | **Not published.** `null` for every record |
| Arrival date | **Not published.** `addedAt` is `null` for every record |

Comparison prices are only recorded when the page publishes one that is genuinely higher than the current price. They are never inferred from a sibling product.

## Products

The 16 original records cover skincare, haircare, bodycare, lip care and accessories. The refinement phase added 6 more, all verified the same way:

| Product | Brand | Published price | Category |
| --- | --- | --- | --- |
| BIOAQUA Hydrating & Moisture Aloe Vera Multi Functional Mask | BIOAQUA | BDT 40 (was 80) | Skincare |
| SADOER Composite Acid Carrot Foam Mask | SADOER | BDT 40 (was 80) | Skincare |
| LAIKOU Sakura Mud Mask 5g | LAIKOU | BDT 30 (was 60) | Skincare |
| Mamaearth Vitamin C Daily Glow Face Wash 100ml | Mamaearth | BDT 530 (was 550) | Skincare |
| Earth Beauty Glosse Shampoo with Argan Oil + Amla + Keratin 350 ml | Earth Beauty & You | BDT 399 | Haircare |
| Earth Beauty Anti Hairfall Shampoo with Biotin + Caffeine 350 ml | Earth Beauty & You | BDT 399 | Haircare |

The two Earth Beauty shampoos publish no comparison price, so theirs is `null` even though a sibling shampoo in the same range does publish one. Inferring it would have been a fabricated discount.

Bangla product names are transliterations written for this demo. They are not merchant-published copy and **require native review before public launch**.

## Photography

All 22 products now use authentic photography retrieved from the retailer's own public product pages. Files are served locally as WebP with a JPEG fallback at two widths (600 and 1050px), normalised to a 3:4 crop.

### Rights status - unresolved

Every image is tagged `rights: 'merchant_source_pending_confirmation'`. **Explicit written confirmation of redistribution rights has not been received.** Public availability is not a licence.

This is deliberate and must not be relabelled as cleared. `npm run check:catalog` asserts the provenance fields are present but cannot assert permission.

### Honest characterisation of the photography

These are the merchant's **lifestyle** photographs, not studio packshots: mixed backdrops (banana leaf, outdoor, white surface), black-gloved hands, product boxes alongside the product, and occasional watermark cards reading "Try this on your Facebook profile pic". This is disclosed rather than hidden, and mitigated by a uniform 3:4 crop and a neutral surface.

Placeholder fallbacks (`rights: 'placeholder'`, a locally generated SVG) remain functional for any product without permitted imagery. No product currently uses one.

## Curation

The featured shelf and the "more to explore" collection are configured as **lists of product ids** in `src/data/curation.ts`, not as a flag on the product record. Both resolve through `getProductById`, so a curated entry can never drift from the price, pack size or photography of the product it points at.

| Constraint | Rule | Enforced by |
| --- | --- | --- |
| Featured cap | 6 products | `check:catalog`, and `slice()` in `resolveSelection` |
| Collection cap | 8 products | `check:catalog`, and `slice()` in `resolveSelection` |
| Unknown id | Fails the check; degrades to a shorter list at runtime | `check:catalog` |
| Duplicate id | Fails the check | `check:catalog` |
| Overlap between the two lists | Fails the check | `check:catalog` |

Unknown ids are dropped rather than thrown on, so a stale configuration shortens a section instead of breaking the page. The cap is applied at resolve time as well as in the check, so the limit holds even if the check is bypassed.

## Verification

`npm run check:catalog` asserts, across all 22 records: unique ids and slugs, positive integer poisha prices, comparison prices that are greater integers or `null`, known categories, at least one localized name, trimmed English names, an image entry with alt text, provenance page and asset URL for photography, a valid retrieval date, every declared image variant present on disk for both widths and both formats, a plausible whole-percent discount, a positive saving, and the `isDemo` marker.

It also asserts the locked demo announcement exists, is locked, carries both locales, and is active - and now the curation constraints above.

## Phase 7 backend audit: catalog findings

The merchant dashboard was audited read-only. Two findings bear directly on this catalog's provenance:

1. **The audited tenant reports an empty catalog** - 0 products, 0 categories - while the live storefront `queenbees.sellbd.shop` publishes **24 product links** and serves imagery from a Zatiq shop path carrying shop id **42239**. Whether the supplied credential owns that shop is **unresolved**. The 22-record fixture in this repository is a curated sample captured from the public storefront; it was never a mirror of the dashboard.
2. **No product schema could be read.** The dashboard's Add Product form did not render in headless Chromium, so no authoritative field list (SKU, variant, stock, compare-at price, images, bilingual fields) was obtained.

Consequence: the local fixture remains the only catalog source, and no mapping to an authoritative backend catalog can be specified yet. The fixture must not be presented as a verified production catalog.

## Known gaps

- No written photography permission.
- No product descriptions; the interface says so rather than inventing copy.
- No arrival dates, so there is no "recently added" list.
- No variant grouping, SKU mapping or stock counts.
- Bangla names need native review.
- Availability is a dated snapshot, never live inventory.
