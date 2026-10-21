# Catalog provenance

Status: 22 products, 5 categories. Last expanded 2026-10-11. The storefront now renders the **database** catalog (Phase 14, ADR 0011); this file records the provenance of those records and of the Phase 1 fixture they were seeded from.

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

## Where the catalog comes from

**The storefront now renders the database catalog (Phase 14, ADR 0011).** `/` and the catalog routes are server components rendered dynamically, so each request performs one catalog read through the server-only typed accessor contract (`src/server/catalog/storefront.ts`, built on `src/server/catalog/read.ts`) and passes serializable props to the client views. Nothing is fetched at runtime by the browser, and no view component holds a database client.

`src/data/` is retained in **two** roles only: as the **seed source** for local/test parity, and as an **explicit, development-only opt-in** (`QUEENBEES_STOREFRONT_FIXTURE=1` - off by default, refused outside a development environment, and never used after a database read failure). It is **no longer the storefront's source of truth**, and it is never a fallback: a database read failure surfaces through the error boundary rather than substituting the fixture.

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

**Phase 14 changes nothing about this.** The seed writes `rights_status: pending_confirmation` on every image row (it never writes `cleared`), so the database catalog carries the same unresolved position as the fixture. This ADR clears no photography.

This is deliberate and must not be relabelled as cleared. `npm run check:catalog` asserts the provenance fields are present but cannot assert permission.

### Honest characterisation of the photography

These are the merchant's **lifestyle** photographs, not studio packshots: mixed backdrops (banana leaf, outdoor, white surface), black-gloved hands, product boxes alongside the product, and occasional watermark cards reading "Try this on your Facebook profile pic". This is disclosed rather than hidden, and mitigated by a uniform 3:4 crop and a neutral surface.

Placeholder fallbacks (`rights: 'placeholder'`, a locally generated SVG) remain functional for any product without permitted imagery. No product currently uses one.

## Curation

The featured shelf and the "more to explore" collection are **id lists, never a flag on the product record**. Since Phase 14 (ADR 0011) the storefront's selections come from the **database** (`collection` + `collection_item`, addressed by item **position**); `src/data/curation.ts` is retained only as the **seed input** for those rows. Both resolve against the loaded catalog, so a curated entry can never drift from the price, pack size or photography of the product it points at, and the caps and disjointness rules below are unchanged.

`npm run check:catalog` still asserts the fixture lists' declared length, absence of repeats, absence of overlap and caps, because they are the seed:

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

It also asserts the locked demo announcement exists, is locked, carries a non-empty English message, and is active - and now the curation constraints above. The owner's own announcement is not part of this fixture: it lives in `store_setting` and is edited at Settings -> Announcement bar.

## Phase 7 backend audit: catalog findings

The merchant dashboard was audited read-only. Two findings bear directly on this catalog's provenance:

1. **The audited tenant reports an empty catalog** - 0 products, 0 categories - while the live storefront `queenbees.sellbd.shop` publishes **24 product links** and serves imagery from a Zatiq shop path carrying shop id **42239**. Whether the supplied credential owns that shop is **unresolved**. The 22-record fixture in this repository is a curated sample captured from the public storefront; it was never a mirror of the dashboard.
2. **No product schema could be read.** The dashboard's Add Product form did not render in headless Chromium, so no authoritative field list (SKU, variant, stock, compare-at price, images, bilingual fields) was obtained.

Consequence: that audit settled nothing about QueenBee's own catalog. The storefront now renders the **database** catalog the owner maintains (Phase 14, ADR 0011), and the Phase 1 fixture is retained only as the seed and a development-only opt-in. The fixture is captured vendor data and must not be presented as a verified production catalog.

## Known gaps

- No written photography permission.
- No product descriptions; the interface says so rather than inventing copy.
- **No capture dates in the captured fixture.** The fixture carries no date-added field, so a
  fixture-backed catalog cannot order products by recency and the homepage omits its "Recently added"
  section rather than inventing an arrival order. The database catalog does have one:
  `product.created_at`, which the homepage's "Recently added" section reads (D6, Phase 26). The
  **three hero photographs** read the same column and the same ordering (owner decision, Phase 26
  revision), so the hero and that section always name the same three products, in the same order.
- No variant grouping, SKU mapping or stock counts.
- Bangla names need native review.
- Availability is a dated snapshot, never live inventory.
