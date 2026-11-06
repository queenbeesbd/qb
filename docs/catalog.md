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

**Implemented (2026-11-05):** browser upload for product images, category photographs, brand logos and hero banners, with server-side decoding, cropping and variant generation. The paragraphs below that say an upload is not built are historical; see "Browser uploads" at the end of this file.
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

All 22 products now use authentic photography retrieved from the retailer's own public product pages. Files are served as **WebP only at three widths (320, 600 and 1050px)**, normalised to a 3:4 crop; the 320 file is the thumbnail a circle downloads and the 600 file is the product card.

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

`npm run check:catalog` asserts, across all 22 records: unique ids and slugs, positive integer poisha prices, comparison prices that are greater integers or `null`, known categories, at least one localized name, trimmed English names, an image entry with alt text, provenance page and asset URL for photography, a valid retrieval date, every declared image variant present on disk as WebP at all three widths, a plausible whole-percent discount, a positive saving, and the `isDemo` marker.

It also asserts the curation constraints above, and it guards the **absence** of a demo notice (ADR 0020): no configured announcement may be `locked`, and none may carry text matching `demo`, `preview` or `demonstration`. The owner's own announcement is not part of this fixture at all: it lives in `store_setting` and is edited at Settings -> Announcement bar.

## Phase 7 backend audit: catalog findings

The merchant dashboard was audited read-only. Two findings bear directly on this catalog's provenance:

1. **The audited tenant reports an empty catalog** - 0 products, 0 categories - while the live storefront `queenbees.sellbd.shop` publishes **24 product links** and serves imagery from a Zatiq shop path carrying shop id **42239**. Whether the supplied credential owns that shop is **unresolved**. The 22-record fixture in this repository is a curated sample captured from the public storefront; it was never a mirror of the dashboard.
2. **No product schema could be read.** The dashboard's Add Product form did not render in headless Chromium, so no authoritative field list (SKU, variant, stock, compare-at price, images, bilingual fields) was obtained.

Consequence: that audit settled nothing about QueenBee's own catalog. The storefront now renders the **database** catalog the owner maintains (Phase 14, ADR 0011), and the Phase 1 fixture is retained only as the seed and a development-only opt-in. The fixture is captured vendor data and must not be presented as a verified production catalog.

## Discovery imagery: category photographs and brand logos (2026-11-02)

The category index and the brand rail are picture surfaces, so two more image families now exist. Both
follow the rule the product photography already follows - an **asset key**, never a URL - and both are
generated at the same two widths (600 and 1050, JPEG + WebP), so one route and one allowlist serve them.

| Family | Key | Column | Built by |
| --- | --- | --- | --- |
| Category photograph | `category-<slug>` | `category.image_key` | `npm run assets:discovery` |
| Brand logo | `brand-logo-<slug>` | `brand.logo_key` | `npm run assets:discovery -- --brands` |

**Category photographs.** Fourteen square photographs, one per visible department, chosen by eye against
the category it illustrates and recorded with its source and credit in
`src/server/catalog/discovery-imagery.ts`. They come from Unsplash's free-licence library; the shop's
own photograph wins whenever the owner picks one in the category editor, and a category with no
photograph draws its icon instead.

**Brand logos.** A logo is taken from the brand's **own website** and only when that site names the brand
in its `<title>` and publishes an icon of at least 96px. Two earlier passes were rejected by that rule:
the first produced five unrelated brands sharing one generic icon, the second attached a WordPress
mark to two more. 59 of 244 brands pass; the rest keep `logo_key = NULL` and the storefront draws their
initials, which the brand index states in words. The build command prints the brands it could not
verify rather than filling the gap.

**Both families are editable from the admin, with a local upload or the shop's own inventory.** The
category editor (`/admin/categories/new`, `/admin/categories/[categoryId]`) and the brand editor
(`/admin/catalog/brands/new`, `/admin/catalog/brands/[brandId]`) each carry the same `CatalogImageField`
as the product editor: a drop zone, a browser-prepared upload, a preview, and an optional choice from
`public/catalog` (`brand-logo-*` first for a brand). The file is posted with the record's own form; the
server re-encodes it to a square (`saveUpload(..., 'square')`), then writes the row and its image in one
transaction. A brand with no logo falls back to its initials; a category with no photograph draws its
icon. The old image-only routes (`/api/admin/catalog/category-image`,
`/api/admin/catalog/brand-image`) were removed in the cutover rather than left as a second path.

**The asset pipeline is still the bulk path.** `npm run assets:discovery` and `npm run assets:upload`
remain how the imported photography arrives; the editor's upload is for the owner's own new file.

## Hero banners: the homepage carousel (Phase 51)

The homepage's first screen is an **ordered carousel of the owner's banner images**, managed at
Settings -> Homepage hero. It follows the same asset rule as everything else in this file:

| Fact | Where it lives |
| --- | --- |
| The image | An asset key under `public/hero`, generated by `npm run assets:hero` at 800 and 1600px, JPEG + WebP, cropped to 16:9 |
| The description | `hero_image.alt_text`, written by the owner and required (1-200 characters) |
| The order | `hero_image.sort_order`, dense 0..n-1 and rewritten by the owner's own move-and-save controls |
| The bounds | At least 1 and at most 10 images, enforced by the service under a transaction advisory lock |

The masters live in `hero/` at the repository root and are never served directly: the build command
writes the generated variants under `public/hero`, and the admin screen can **associate** one of those
keys or **upload** a new file (see Browser uploads below). An associated key is accepted only when both
widths exist as WebP with the expected dimensions, read from the bytes.

The storefront reads the rows in `sort_order` and renders nothing at all when the table is empty -
never a placeholder banner. Changing the order or removing an image on the admin page changes the next
storefront render; no code change or rebuild is involved.

## Known gaps

- No written photography permission.
- No product descriptions; the interface says so rather than inventing copy.
- **No capture dates in the captured fixture.** The fixture carries no date-added field, so a
  fixture-backed catalog cannot order products by recency and the homepage omits its "Recently added"
  section rather than inventing an arrival order. The database catalog does have one:
  `product.created_at`, which the homepage's "Recently added" section reads (D6, Phase 26). The
  homepage hero no longer derives from products at all: since Phase 51 it is the owner's carousel of
  banner images, ordered explicitly, so it makes no recency claim.
- No variant grouping, SKU mapping or stock counts.
- Bangla names need native review.
- Availability is a dated snapshot, never live inventory.

## Browser uploads (2026-11-05)

The owner can upload an image from their computer for every image surface: product gallery photographs,
category photographs, brand logos and homepage hero banners. This replaces the association-only rule for
*new* images; the asset inventory is still authoritative for images already on the server.

**Where it runs.** `src/server/catalog/uploads.ts` is the only module that touches an uploaded file. It
decodes with `sharp` (40 MP ceiling), applies EXIF orientation, re-encodes to the surface's declared frames
as **WebP only** (owner direction, 2026-11-05), and strips metadata. The key, dimensions, content type and
byte size are produced from the decoded bytes - the browser supplies no path, URL, key or metadata.

| Surface | Output (WebP only) | Route |
| --- | --- | --- |
| Product | 320x427, 600x800 and 1050x1400 | `POST /api/admin/catalog/product` (`images` field) |
| Category | 320, 600 and 1050 squares | `POST /api/admin/catalog/category` (`image` field) |
| Brand | 320, 600 and 1050 squares | `POST /api/admin/catalog/brand` (`image` field) |
| Hero | 800x450 and 1600x900 | `POST /api/admin/hero` (`operation=upload`) |
| Offer popup | square (320/600/1050) or wide (800/1600) | `POST /api/admin/settings/offer-popup` (`image` field) |

**Why three widths.** The storefront picks by rendered size: a 116px circle downloads 320, a product card
downloads 600, and only the detail photograph asks for 1050. `npm run assets:optimize` re-encodes the whole
stored tree to the same rule, so an image uploaded before this change is not left as a 1050 master behind a
card. The JPEGs generated earlier remain in the bucket as dead bytes; nothing references them, and deleting
objects that were once served is a separate decision.

**Where the bytes go.** Every upload is written to `public/catalog` (or `public/hero`) when the filesystem
is writable, and to the configured object-storage bucket when `CATALOG_STORAGE_*` is set. At least one must
succeed; a read-only deployment with no storage refuses the upload rather than reporting a success. The
bucket credential must carry **`storage:write`** - a read-only scoped credential answers `403` and the
upload fails. The path
`/hero/[...path]` was added beside `/catalog/[...path]` so an uploaded banner in the bucket resolves without
being part of the build.

**Caps and refusals.** 4 MB per request (below Vercel's 4.5 MB body ceiling). The admin file input
(`AdminImageInput`) prepares a large photograph **in the browser first**: it decodes it, scales the long
edge to 1600px and re-encodes it as WebP, so a 5-15 MB camera JPEG arrives as roughly 1 MB and the 4 MB
cap is no longer the owner's problem. If the browser cannot decode the file (HEIC from an iPhone is the
usual case) the original is submitted and the cap still states its refusal. Non-image bytes, an empty
file, an oversized file, or an unreadable image is refused with the editor's own invalid notice. Uploading is
gated on the same permissions as the association it replaces (`catalog.write`, `settings.write` for hero),
with CSRF and origin checks from `guardMutation`.

**Not built.** No drag-and-drop, no client-side cropping, no image library/bulk upload and no deletion of the
bytes themselves (removing an association still leaves the file, as before). There is no automatic purge of
the superseded JPEG variants.
