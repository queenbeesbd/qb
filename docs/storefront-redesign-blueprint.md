# QueenBee's Storefront Redesign Blueprint

**Status:** audit and plan only — nothing in this document has been implemented.
**Date:** 2026-11-03
**Author:** design audit session (read-only). All reference measurements below were taken live in a
real browser at 1440×900 (desktop) and 390×844 (mobile emulation); all code references point at
files that were actually read.

---

## 1. Executive Design Assessment

### What the storefront already does well

- **A real design system exists.** `src/app/globals.css` defines a coherent token set: brand anchors
  (`#a680ff`, `#f6b3cc`), an accessible derived action palette (`#56358c`), a full type scale with a
  documented iOS-zoom guard, a spacing scale, radii, two shadows, a container system (`--container:
  1440px`, fluid gutters) and admin tokens. Any redesign should *extend* this, not replace it.
- **Component quality is high.** `HomeSections.tsx`, `ProductDetailView.tsx` and `CategoriesView.tsx`
  are carefully engineered: honest empty states, live-region add-to-cart confirmation, a scroll-aware
  mobile buy bar (`product.module.css` + `data-buy-bar`), accessibility-first gallery thumbs, and
  comment blocks that document *why* each composition exists.
- **Images are disciplined.** `src/lib/images.ts` derives every rendered path from an asset key
  (`/catalog/<key>-<width>.{webp,jpg}`, widths 600/1050, square category/brand assets, 3:4 product
  masters, per-context `sizes` hints). `check:catalog` enforces completeness. This pipeline is the
  backbone the redesign must keep.
- **Mobile is genuinely first-class.** The homepage is mobile-first (`home.module.css` header comment:
  "the phone is the primary shop — owner's priority: 80% mobile"), with a spotlight row instead of a
  shrunken collage, edge-to-edge scroll rails with negative-margin gutters, snap scrolling, and a
  fixed buy bar on the PDP (measured: `position: fixed` at 390px).
- **Category and brand imagery already exist end-to-end.** `category.imageKey` and `brand.logoKey`
  columns, a validated admin picker (`/api/admin/catalog/category-image`, `choose|clear` operations
  against a server-side asset inventory), a provenance-tracked Unsplash pipeline
  (`src/server/catalog/discovery-imagery.ts`, 14 categories) and a verified brand-logo fetcher
  (`scripts/build-discovery-assets.ts --brands`).

### What is actually weak (and what the owner is reacting to)

- **The storefront is visually quiet to the point of blandness.** Measured on desktop (1440px):
  white surfaces on a near-white canvas (`#faf8fc`), one shadow level, 8–12px radii, no promotional
  color blocking, no campaign surface, no photographic hero. The brand's pastel purple and pink are
  present only as *buttons and accents*; the page reads as a neutral utility, not a cosmetics brand.
- **The homepage category rail is square and small** (84px tiles phone / 96px desktop, per
  `home.module.css .categoryRail`). This is precisely the pattern the previous failed attempt was
  supposed to replace with the Azaan-style **circular** presentation — the requirement this blueprint
  makes non-negotiable (§6).
- **No hero promotional carousel.** The only carousel is the offers shelf
  (`home/OfferCarousel.tsx`, which is good and should be kept). Ghorer Bazar's rhythm — campaign
  banner → categories → campaigns → products — is absent.
- **Shop-by-Brand is a text-led list** (`BrandIndexView.tsx`), and the homepage brand rail is a
  small grid of marks; it does not read as a "brand discovery" destination.
- **PDP image column dominates on desktop.** Measured: figure renders **478×598px** of a 1440px
  viewport with a single image + thumbnail strip; the info column is squeezed. The frame is portrait
  (`3:4` source) inside a portrait figure, so the image wall is taller than the entire info column on
  most products.
- **Density is uniform.** Every section uses the same card, the same gap, the same background. There
  is no alternation of rhythm (full-bleed band, tinted section, editorial strip) that makes
  professional storefronts feel composed.

### Overall opportunity

This is **not** a rebuild. It is a *visual richness pass* on top of an unusually sound foundation:
re-skin the homepage into a composed, promotional, brand-forward page; convert the category rail to
the circular Azaan pattern; give `/categories` the Pandamart square grid (it is already 80% there);
upgrade brand discovery; rebalance the PDP. All data, cart, checkout, auth and admin flows remain
untouched.

---

## 2. Reference Analysis

### Reference A — Ghorer Bazar (ghorerbazar.com) — *homepage rhythm & commerce density*

Measured live (desktop 1440, mobile 390; screenshots in `/tmp/refs/ghorer-*.png`):

- **Section order:** Header → promo/offer strip → **Featured Categories** → Top Selling Products →
  **Our Brands** → *campaign bands* ("All Natural Honey", "Premium Dates", "Cooking Essentials",
  "Organic Certified") alternating with product rows → "Just For You" → footer.
- **Category tiles:** square images **142×142px, border-radius 20px**, label below (mobile: 100px,
  r=20px). Softly-rounded squares, not circles — this is the *categories-page* pattern, matching the
  Pandamart direction, not the homepage carousel.
- **Product cards:** square images **300×300px, r=8px**, price + discount, dense grids.
- **PDP:** large square-ish gallery image **512×529px**, r=4px, info column beside it.
- **Header:** ~137px desktop with utility row (Track Order, Sign In, Wishlist, Cart) above a category
  nav row; 53px on mobile.
- **Visual language:** warm neutrals, generous campaign bands with photographic backgrounds, tight
  product grids. Commerce-dense, campaign-led.

**What QueenBee's should take:** the section *rhythm* (categories → products → brand band → campaign
band → more products), the campaign-band concept (adapted to QueenBee's pastel palette instead of
Ghorer's earthy neutrals), the promo strip under the header, and "categories as softly-rounded
squares" for the `/categories` page.

### Reference B — Azaan Glow (azaanglow.vercel.app) — *circular category carousel* (REQUIRED pattern)

Measured live (desktop 1440; mobile 390; screenshots in `/tmp/refs/azaan-*.png`, DOM-measured):

| Property | Desktop (1440) | Mobile (390) |
| --- | --- | --- |
| Section heading | "Featured Categories", 21.75px / weight 800 | same, ~14px |
| Container | horizontal scroll, `overflow-x: auto`, `gap: 14.5px`, width 1131px | width 365px, gap 9.4px |
| Item width | 101px | 79px |
| **Circular frame** | **72×72px, `border-radius: 9999px`, `aspect-square`, `max-w-[72px]`** | **64×64px circle** |
| Image inside | 66×66px, `object-fit: cover`, square source cropped by the circular wrapper | 64px |
| Label | below circle, 11px / **700** ("Face") | 11px / 700 |
| Count pill | below label, 9px / 600, rounded-full ("172 products") | same |
| Snap | `scroll-snap-type: x mandatory` | same |
| Items fully visible | ~10 of 13 (scrollable, `scrollWidth 1496 > 1131`) | ~4–5 of 13 (`scrollWidth 1145`) |
| Page position | directly under hero, above "Shop By Brands" rail | same |

Also observed on Azaan: a **"Shop By Brands"** horizontal rail directly after the category carousel,
and product cards with `aspect-[3/4]` imagery and a desktop-only "Quick view" hover pill.

**What QueenBee's must take:** the circular item anatomy is exact and non-negotiable — a square
aspect-ratio wrapper with a fully-rounded border-radius cropping a square photograph via
`object-fit: cover`, a bold centered label beneath, an optional count pill, in a snap-scrolling
horizontal rail. It is *not* a square card grid and must not regress into one.

### Reference C — Pandamart (via foodpanda.com.bd darkstore pages) — *square category grid*

Measured live (mobile 390; screenshot `/tmp/refs/pandamart-mobile.png`):

- Category tiles: **88×88px square images, border-radius 8px**, in a horizontal
  `category-tile-swimlane__list` (`display: flex; gap: 12px; overflow-x: scroll`) on the store home;
  the deep-linked category listing uses the same square-image language in a grid ("Baking
  Ingredients, Cooking Ingredient, …").
- Product tiles on the same page: identical square treatment (88px), consistent radius, consistent
  crop — the *consistency* is the pattern.

**What QueenBee's should take:** for the dedicated `/categories` page — square image containers,
one consistent radius (~12–16px at QueenBee's larger tile size), consistent crop, clear labels.
QueenBee's `CategoriesView.tsx` already implements a 2-col (phone) → 5-col (desktop) square grid with
`CATEGORY_TILE_FRAME = '1 / 1'`; the redesign refines it visually (larger tiles, Pandamart-style
count badge placement, tagline treatment) rather than restructuring it.

---

## 3. Current Application Audit

### Stack

- Next.js **16.4.3** App Router, React 19, strict TypeScript, Drizzle ORM + Neon/Postgres.
- **CSS Modules + global token layer** (`src/app/globals.css`). No Tailwind.
- i18n: `src/i18n/dictionaries.ts` (1,566 lines) with bn/en paired columns in the DB
  (`name_bn`/`name_en`); `check:i18n` enforces parity. **Application-owned files must not gain
  literals** — all new UI strings go through the dictionaries.
- Scripts: `verify:storefront` (95/95 browser + 32/32 HTTP), `verify:admin` (193/193), `typecheck`,
  `lint`, `check:catalog`, `check:i18n`.

### Storefront routes and views

| Route | View | Notes |
| --- | --- | --- |
| `/` | `HomeView` (`src/features/catalog/HomeSections.tsx`) | hero (spotlight on phone / collage ≥1024px) → deals carousel → category rail → featured grid → brand rail → new arrivals grid → browse grid |
| `/products` | `CatalogView` + `FilterControls`, `MobileFilterDrawer`, `ProductSearch` | URL-driven search/filter/sort |
| `/products/[slug]` | `ProductDetailView` (`ProductDetailView.tsx`) | breadcrumb, single-image figure + thumb strip, info column, buy bar (mobile), related grid |
| `/categories` | `CategoriesView` (`CategoriesView.tsx`) + module CSS | square tile grid (2→5 cols), brand teaser (12 busiest), footnote |
| `/categories/[slug]`, `/brands`, `/brands/[slug]` | category listing, `BrandIndexView`, brand listing | brand index is text/list-led |
| `/cart`, `/checkout`, `/account/**`, `/orders/[orderNumber]` | cart & checkout feature views | out of redesign scope, must not break |

Shared components: `Header.tsx` (fixed, 65px, `--header-height: 64px`), `AnnouncementBar.tsx`,
`StorefrontTabBar.tsx` (mobile bottom nav), `Footer.tsx`, `ProductCard.tsx`, `ProductGrid.tsx`,
`ProductPhoto.tsx`, `DiscoveryPhoto.tsx` (`BrandMark` with initials fallback), `QuantityStepper.tsx`,
`OfferCarousel.tsx` (the only existing carousel — swipeable phone, paged desktop with progress bar).

### Responsive implementation (regression-risk map)

- Breakpoints in use: **480 / 720 / 880 / 1024 / 1199 / 1440** (`min-width` only, mobile-first).
  - `home.module.css`: 480, 720, 1024. `product.module.css`: 480, **880** (two-column PDP + buy-bar
    hide). `CategoriesView.module.css`: 480, 720, 1024. `images.ts` `sizes` hints assume 719/1023/
    1199/1439/1599 boundaries — **changing rendered column counts requires updating the matching
    `sizes` constant or the browser fetches wrong-width sources.**
- Rails use a deliberate pattern: negative inline margins to the gutters + `overflow-x: auto` +
  `scroll-snap` + `scrollbar-width: none` + `contain: layout paint`. New rails should copy this.
- Known coupling risks:
  1. `CARD_FRAME = '5 / 4'` (home) vs `LISTING_CARD_FRAME = '4 / 5'` (listing) — two crop shapes from
     the same 3:4 masters; changing either changes every card of that surface.
  2. `HomeSections.tsx` hero has **two intentional compositions** (spotlight <1024, collage ≥1024) —
     a previous-style refactor that unifies them is exactly how desktop got broken last time.
  3. `StorefrontTabBar` is fixed-position; new full-bleed sections must respect bottom safe-area.
  4. Working tree currently has an untracked `.tmp-dbcheck.ts` (pre-existing; leave alone).

### Data model (verified in `src/db/schema/catalog.ts`)

- `brand`: `slug`, `nameBn`, `nameEn`, **`logoKey`** (nullable asset key, format-checked), soft delete.
- `category`: `slug`, `parentId`, bn/en names + descriptions, `sortOrder`, `isVisible`,
  **`imageKey`** (nullable asset key), **`tagline`** (English one-liner), soft delete.
- `product` / `productVariant` / `productImage` (+derivatives) / `collection` / `collectionItem`.
- **No schema changes are needed for anything in this blueprint.**

### Imagery pipeline (verified)

- Asset keys → `/catalog/<key>-<width>.{webp,jpg}` at widths 600/1050, served with an inventory
  allowlist; admin "uploads" are **association-only** (ADR 0006 — no object-storage upload path; the
  admin picker lists server-owned assets). `ProductMediaPanel.tsx` documents this gap explicitly.
- Discovery assets: `npm run assets:discovery [-- --brands]` builds square category photos
  (provenance-tracked Unsplash IDs, 14 categories in `CATEGORY_PHOTOS`) and **verified** brand logos
  (domain must prove itself via title match, else `logoKey` stays null → initials fallback);
  `npm run seed:discovery` writes the `imageKey`s. `npm run assets:upload` pushes to object storage.

### Admin panel

- Category editor (`CategoryForm.tsx`, 453 lines) already has the image row: preview, asset picker
  (`select` of inventory keys), and clear button, posting to
  `/api/admin/catalog/category-image` with permission guard, CSRF, safe `returnTo`.
- **Gap to document (not necessarily fix):** the owner cannot *upload* a new category image from the
  browser — they can only associate an existing generated asset. If the owner wants true uploads,
  that is a new capability (file processing service) and should be its own phase; the blueprint's
  default is the existing associate-from-inventory flow plus adding new assets via the existing
  asset pipeline scripts.

---

## 4. Proposed Design Direction

### Visual world: "soft apothecary commerce"

A cosmetics shop that feels curated and premium without abandoning the existing token system.

- **Color.** Keep every existing token. Add *usage*, not hues:
  - Hero and campaign bands tinted with `--color-action-soft` (#f3edff) and `--color-accent-soft`
    (#fdeef3) — large pastel fields, not gradients.
  - `--brand-secondary` (#f6b3cc) reserved for promotional badges (deal %, "New") so pink always
    means *offer*.
  - Dark purple `#56358c` remains the only filled action color (buttons, active tab) — scarcity keeps
    CTA contrast.
- **Typography.** Keep the scale. Add weight contrast: section titles at `--text-xl`/700 with an
  optional soft-tinted eyebrow label; body stays 15px. Bengali uses the existing `--font-bengali`.
- **Shape.** Two radii with meaning: `--radius-pill` (999px) for **circular category items, count
  pills, badges**; `--radius-lg` (12px) for everything rectangular (cards, bands, inputs). No 20px+
  mixed radii.
- **Elevation.** Cards stay flat with `--shadow-sm`; only hover/floating elements get `--shadow-md`.
  Depth comes from tinted fields, not shadows.
- **Image treatment.** Square masters cropped per context (`object-fit: cover`), exactly as today.
  Circular crop only in the homepage carousel; square 12px crop everywhere else.
- **Motion.** Extend existing durations (`--transition-fast: 120ms`, `--transition-base: 180ms`):
  hover lifts (`translateY(-2px)` + shadow-md, desktop only), rail snap momentum, carousel progress
  bar (already exists in OfferCarousel — reuse its pattern), `:active` scale(0.98) on all controls.
- **Anti-goals** (per brief): no glassmorphism, no decorative oversized blobs, no gradient buttons,
  no new neon accents, no generic template look.

### Mobile vs desktop philosophy

Preserve what exists: mobile-first CSS with `min-width` enhancements; each surface keeps **two
authored compositions** where behavior differs (hero, PDP, category rails). New sections must state
their phone composition first and their ≥1024px composition separately in both JSX structure and CSS.

---

## 5. Homepage Blueprint (top to bottom)

Order and rationale per section. All data comes from the existing `HomeView` props — no new queries
except where noted.

| # | Section | Purpose | Mobile | Desktop | Depends on |
| --- | --- | --- | --- | --- | --- |
| 0 | AnnouncementBar + Header | keep as-is; header gains a desktop category dropdown later (optional phase) | fixed 64px + tab bar | utility row option | existing |
| 1 | **Hero** | brand statement + first product | keep current spotlight composition (it is good) | keep 3-frame collage; add tinted `--color-action-soft` background field + decorative petal SVG in brand colors behind the copy | `heroProducts` |
| 2 | **Promo strip** *(new)* | rotating campaign messages | single line under header, auto-advances | same strip, centered | announcement setting or new dictionary strings; reuse AnnouncementBar data |
| 3 | **Deals carousel** | offers visible without scrolling | keep swipe shelf | keep paged slider | `OfferCarousel` (reuse unchanged) |
| 4 | **Circular category carousel** | primary department discovery | snap rail, 72–80px circles, ~4.5 visible | centered rail, 104–120px circles, 8–10 visible; optional arrow buttons ≥1024px | `departments` + `category.imageKey` (§6) |
| 5 | **Featured grid** | owner's picks | keep 2-col grid | keep 5-col grid | `featured`, `ProductCard`, `CARD_FRAME` |
| 6 | **Brand band** *(upgraded)* | brand discovery moment | swipe rail of logo chips (pill cards) | full-width tinted band (`--color-accent-soft`), logo chips in 2 rows, "All brands" CTA | `brands` + `logoKey` (§8) |
| 7 | **New arrivals** | freshness | keep grid | keep grid | `newArrivals` |
| 8 | **Campaign band** *(new)* | seasonal/editorial pause, breaks grid monotony | stacked tinted card with photo + CTA | horizontal band: photo left, copy right (alternating sides per band) | `collection`/curation data or a new dictionary-driven block; **do not invent backend — start with one hardcoded-owner-editable campaign from settings** |
| 9 | **Browse grid** | long-tail discovery | keep | keep | `browse` |
| 10 | Footer | keep structure; add newsletter placeholder only if owner wants it | — | — | existing |

Rhythm principle: tinted/photographic sections (1, 6, 8) alternate with white product sections so
the page breathes; no two adjacent sections share a background.

---

## 6. Circular Category Carousel Specification (Reference B — mandatory)

**This section supersedes any square-tile interpretation on the homepage.** The homepage category
section becomes a circular rail; the `/categories` page keeps squares (§7). Both read the same
`category.imageKey` data.

### Item anatomy (per measured Azaan spec, adapted to QueenBee's scale)

```
┌──────────┐
│  ◯ 96px  │  square aspect-ratio wrapper, border-radius: 50%,
│  photo   │  overflow hidden; <img> object-fit: cover, 100%/100%
└──────────┘
   Face          label: 12px / 700, centered, ink
  24 items       count pill (optional): 10px/600, pill radius,
                 --color-action-soft bg, muted ink
```

| Property | Phone (<720) | Tablet (720–1023) | Desktop (≥1024) |
| --- | --- | --- | --- |
| Circle diameter | **76px** | 88px | **104px** (rail max-width keeps 9–10 visible) |
| Item total width | 88px | 100px | 120px |
| Gap | 12px | 14px | 16px |
| Visible items | ~4 full + peek | ~6 | 9–10; arrows optional |
| Label | 11px/700 | 12px/700 | 12px/700 |
| Count pill | hidden <380px if crowded | shown | shown |
| Scroll | native `overflow-x: auto`, `scroll-snap-type: x mandatory`, edge-to-edge (existing negative-gutter pattern) | same | contained in container; drag + wheel; arrows optional |

### Behavior and data

- **Source images:** existing square category assets (`category-<slug>-{600,1050}`) — already square,
  already generated. Circle crop is pure CSS (`border-radius: 50%` + `object-fit: cover`), so
  **no new asset sizes are needed**; 600px masters are more than enough for a 104px circle.
- **Fallback:** un-photographed categories render the existing `CategoryIcon` glyph centered in a
  tinted circle (`--color-action-soft`) — never a broken image, matching the current `DiscoveryPhoto`
  contract.
- **Interaction:** whole item is one `<Link>` to `/categories/[slug]`; hover = circle ring
  (`2px solid var(--brand-primary)` ring at 4px offset) + label darkens; active = scale(0.97).
  Keyboard focusable; label is the accessible name.
- **Placement:** section 4 in §5, with a `SectionHeader` ("Shop by category" + "View all").
- **Component:** new `CategoryCircleRail` (`src/features/catalog/home/CategoryCircleRail.tsx`), a
  presentational child of `HomeView`; the old square `.categoryRail` styles are retired *only on the
  homepage* — `/categories` keeps its own grid component untouched.

### Acceptance (verbatim, testable)

1. At 1440px, category images render as perfect circles (equal width/height, `border-radius: 50%`),
   diameter 104px ±4px, ≥9 categories visible.
2. At 390px, circles are 76px ±4px, ~4 visible with the next peeking, horizontally snap-scrollable,
   no vertical page overflow.
3. Labels sit **below** the circle, bold, centered; count pill below label when present.
4. A category without `imageKey` shows the icon glyph in a tinted circle; nothing breaks.
5. Every item navigates to its category page; carousel data is the real `departments` prop.

---

## 7. Categories Page Blueprint (`/categories`, Reference C)

`CategoriesView.tsx` is structurally right. The redesign is visual refinement:

- **Tile:** square photo (`1/1`), radius **16px** (Pandamart consistency at larger scale), subtle
  border (`--color-border`) + `--shadow-sm` on hover; label **below** the tile, 14px/600, centered;
  count badge as a small pill overlapping the tile's top-right (Pandamart-style), keeping the
  existing `tagline` line when present.
- **Grid:** 2 cols phone → 3 cols (720) → 4–5 cols (1024+), gap 16–20px. Keep the existing
  `CATEGORY_TILE_SIZES` hints in sync with any column-count change.
- **Icon fallback:** unchanged (`CategoryIcon` in the same square).
- **Brands teaser block:** restyle as logo chips (§8) but keep the 12-brand cap and `/brands` link.
- **Admin workflow:** unchanged — owner picks from server-owned square assets in `CategoryForm`
  (existing picker). Documented gap: no browser upload; if the owner requires uploads, schedule a
  separate "asset upload service" phase *after* this redesign (see §15).

**Acceptance:** all tiles are equal squares in every breakpoint; radius uniform (16px); count pill
never overlaps the label; a category without a photo still occupies an equal square; admin picker
flow works untouched (regression: `verify:admin` categories suite passes).

---

## 8. Shop by Brand Blueprint

### Current state (verified)

`brand.logoKey` exists; `scripts/build-discovery-assets.ts --brands` already fetches logos from
official domains with **two-step verification** (real image ≥32px + site `<title>` contains the brand
name) and falls back honestly to initials (`BrandMark`). ~200 brands; 12 busiest shown on
`/categories`; `/brands` is a text-led index.

### Proposed experience

1. **Homepage brand band** (§5 #6): tinted full-width band; logo chips = white pill cards
   (radius `--radius-pill`), logo at 48–64px + name; horizontal swipe on phone, wrapped 2-row grid on
   desktop; "All brands" CTA → `/brands`.
2. **`/brands` page:** keep `BrandIndexView` data flow; restyle the index into an A–Z chip grid with
   letter anchors; each chip links to `/brands/[slug]` (existing pages with product grids).
3. **Imagery sourcing — no new system:**
   - Primary: run the existing `assets:discovery --brands` + `assets:upload` pipeline (owner runs
     this occasionally; it is resumable and provenance-recorded).
   - Fallback: initials mark (already built and honest — keep it; never hotlink, per ADR 0006).
   - Licensing/reliability: the existing title-verification rejects wrong/generic marks; rejected
     brands display initials until the owner associates a real logo via the admin (same
     association-only pattern as category images).
   - Caching/delivery: identical to all catalog imagery (generated widths + allowlisted route); no
     third-party icon CDN at render time.

**Acceptance:** brand band shows ≥10 chips on desktop without page weight regression (chips reuse
600px square assets downscaled — add `sizes` hints); a brand with `logoKey = null` shows a styled
initials chip, never an empty box; `/brands/[slug]` product grids unchanged.

---

## 9. Product Details Blueprint

### Problems (measured)

- Desktop figure 478×598 portrait (3:4) makes the media column ~40% taller than the info column;
  with 1–2 photos the gallery feels empty yet enormous.
- Mobile: full-width 356px-wide portrait image before any price info; buy bar mitigates but the
  first screen is mostly image.

### Redesign

**Desktop (≥880):**
- Two-column 55/45 split: **gallery 55%**, info 45%.
- Main image frame: **square (1/1)** at ~520–560px max — a square from the 3:4 master crops only
  modestly and kills the height excess. Keep full 3:4 *uncropped* quality available via a
  lightbox/zoom modal (click main image → overlay with original aspect; reuse `--shadow-md` +
  existing transition tokens).
- Thumbnail strip becomes a **vertical rail left of the main image** (classic PDP pattern), 72px
  thumbs, keyboard operable (the current buttons already are).
- Info column: brand link → title → price block (current price `--text-2xl`, compare-at struck,
  savings pill in `--color-accent-soft` w/ pink text) → short description → facts dl → quantity +
  Add-to-cart (48px, full action purple) → details section. Sticky within the column on long
  descriptions (`position: sticky; top: calc(var(--header-height) + 16px)`).
- Related products: keep grid; move into a tinted section for rhythm.

**Mobile (<880):**
- Gallery becomes a **snap carousel of full-width images with dot indicators** (swipeable, the
  natural phone pattern) instead of one image + strip below.
- Keep the existing fixed buy bar (it is good); ensure the carousel height (~75vw) keeps title +
  price on the first screen.
- Keep add-to-cart confirmation panel and live region exactly as-is.

**Data/logic invariants:** same `product.images`, `activeImage` state, discount math
(`discountAmount/Percent`), availability gating, cart wiring, `DETAIL_SIZES` updated to match any new
rendered width (e.g. `(max-width: 879px) 92vw, 480px`).

**Acceptance:** desktop PDP main image ≤560px tall at 1440 viewport; info column vertically
balanced with gallery; zoom shows uncropped 3:4; mobile gallery swipes with dots; add-to-cart,
buy bar, related products, and out-of-stock states all behave identically (`verify:storefront`
PDP checks pass).

---

## 10. Responsive Design Specification

### Breakpoint strategy (unchanged, now documented)

| Token | Value | Governs |
| --- | --- | --- |
| base | <480 | phone composition of every section |
| `480` | ≥480 | rail tile bumps (84→96px), 2-col tweaks |
| `720` | ≥720 | 3-col grids, tablet rails |
| `880` | ≥880 | PDP two-column + buy-bar removal |
| `1024` | ≥1024 | desktop homepage compositions (hero collage, category grid vs rail) |
| `1440` | ≥1440 | container cap binds; gutters capped at 40px |

### Coexistence rules (the anti-regression contract)

1. **No global CSS edits.** All changes live in (new) CSS Modules or clearly additive token
   declarations in `globals.css`. `:root` may gain tokens; existing token values must not change.
2. **Mobile-first authoring:** every new style is written at 390px and enhanced with `min-width`
   queries from the table above — never desktop-first with `max-width` patches.
3. **Two-composition rule:** where phone and desktop differ structurally (hero, PDP gallery, category
   presentation), render *both* compositions with the same data and hide one per breakpoint — never
   one element restyled beyond recognition (the documented failure mode of the previous attempt).
4. **`sizes` parity:** any rendered-size change updates the matching constant in `src/lib/images.ts`
   in the same commit; `check:catalog` still passes.
5. **Per-phase verification matrix:** after each phase, screenshot every touched route at
   **390, 768, 1024, 1440** and compare against the phase's stated desktop and mobile acceptance;
   run `npm run verify:storefront`, `npm run typecheck`, `npm run lint`.
6. **Fixed elements:** buy bar, header, `StorefrontTabBar` keep their z-index/safe-area contracts;
   new full-bleed rails must use the existing negative-gutter pattern, not new page-padding
   assumptions.

---

## 11. Component Architecture

### Reuse unchanged
`Header`, `AnnouncementBar`, `Footer`, `StorefrontTabBar`, `ProductCard`, `ProductGrid`,
`ProductPhoto`, `DiscoveryPhoto`/`BrandMark`, `QuantityStepper`, `CartProvider`, all cart/checkout/
account views, entire admin panel, `src/lib/*`, `src/server/*`, i18n dictionaries (extended, never
bypassed).

### New components
| Component | Location | Notes |
| --- | --- | --- |
| `CategoryCircleRail` | `src/features/catalog/home/CategoryCircleRail.tsx` + module CSS | §6 spec; presentational, takes `departments` |
| `PromoStrip` | `src/components/PromoStrip.tsx` | rotating messages; data from announcement setting/dictionary |
| `CampaignBand` | `src/features/catalog/home/CampaignBand.tsx` | editorial band; content owner-editable via settings (phase-gated) |
| `BrandChipRail` | `src/features/catalog/home/BrandChipRail.tsx` | §8 band |
| `GalleryCarousel` | `src/features/catalog/product/GalleryCarousel.tsx` | mobile PDP snap gallery with dots |
| `ZoomModal` | `src/features/catalog/product/ZoomModal.tsx` | desktop PDP lightbox (3:4 uncropped) |

### Refactor (behavior-preserving)
- `HomeSections.tsx` `HomeView`: swap square rail → `CategoryCircleRail`; insert `PromoStrip`,
  `CampaignBand`, `BrandChipRail`; hero section gains background field only.
- `ProductDetailView.tsx`: gallery block → `GalleryCarousel` (<880) / vertical thumbs + `ZoomModal`
  (≥880); info column gains sticky wrapper.
- `CategoriesView.module.css`: tile radius/count-pill/tagline restyle (no JSX structure change).
- `BrandIndexView`: chip-grid restyle.
- `src/lib/images.ts`: add `CIRCLE_RAIL_SIZES`, update `DETAIL_SIZES`; no changes to path derivation.

### Deliberately separate per viewport
- Hero (spotlight vs collage) — already separate; keep.
- PDP gallery (carousel vs thumbs+zoom) — new but follows the same two-composition rule.

---

## 12. Data and Asset Requirements

| Need | Status | Action |
| --- | --- | --- |
| Square category photos (14) | ✅ exist (`assets:discovery`, `category.imageKey`) | none; optional re-curation later via provenance list |
| Brand logos | ✅ pipeline exists, verified-fetch with initials fallback | owner runs `assets:discovery --brands` + `assets:upload` when brand set changes |
| Circle-carousel assets | ✅ same square assets, CSS-cropped | none |
| Campaign band imagery | ⚠️ new | one or two curated square/landscape assets through the existing pipeline; stored as catalog assets |
| Category image **upload** from admin | ❌ association-only today (ADR 0006) | out of scope for redesign; separate phase if owner requires it (§15) |
| Schema changes | — | **none required** |
| i18n strings | ⚠️ | every new string in `src/i18n/dictionaries.ts` (bn + en), pass `check:i18n` |

---

## 13. Implementation Roadmap

Each phase is independently verifiable and leaves both viewports green.

**Phase R1 — Circular category carousel (highest priority)**
- Scope: `CategoryCircleRail` + swap in `HomeSections`; retire homepage square rail styles.
- Files: `HomeSections.tsx`, new component + CSS, `home.module.css` (section spacing only),
  `images.ts` (`CIRCLE_RAIL_SIZES`), dictionaries.
- Outcome: §6 acceptance passes at 390/768/1024/1440.
- Risk: low; no shared component touched. Regression check: `/categories` unchanged.

**Phase R2 — Product details rebalance**
- Scope: desktop square frame + vertical thumbs + zoom modal; mobile carousel; sticky info column.
- Files: `ProductDetailView.tsx`, `product.module.css`, new `GalleryCarousel`/`ZoomModal`,
  `DETAIL_SIZES`.
- Outcome: §9 acceptance; `verify:storefront` PDP checks pass.
- Risk: medium (touching buy-bar/scroll observer code — keep `pastGallery`/`purchaseInView`
  observers intact; 880px boundary unchanged).

**Phase R3 — Homepage composition & visual richness**
- Scope: hero tinting, `PromoStrip`, section rhythm/spacing, card hover language, footer polish.
- Files: `home.module.css`, `HomeSections.tsx`, `PromoStrip`, `globals.css` (additive tokens only).
- Outcome: homepage matches §5 order and rhythm at both sizes.
- Risk: medium (broadest surface); mitigated by additive-only CSS and per-breakpoint screenshots.

**Phase R4 — Shop by Brand**
- Scope: `BrandChipRail` homepage band; `/brands` chip index restyle.
- Files: `BrandChipRail`, `BrandIndexView` + CSS, `home.module.css`.
- Outcome: §8 acceptance. Risk: low.

**Phase R5 — Categories page refinement**
- Scope: tile radius/badge/tagline restyle, grid density tune + `CATEGORY_TILE_SIZES` sync.
- Files: `CategoriesView.tsx` (minor), `CategoriesView.module.css`, `images.ts`.
- Outcome: §7 acceptance; `verify:admin` category suite passes. Risk: low.

**Phase R6 — Campaign band (optional, owner input needed)**
- Scope: one owner-editable campaign band (setting + asset key) rendered on homepage.
- Risk: touches settings/admin slightly — isolate behind an existing settings pattern; skip if owner
  has no campaign content yet.

---

## 14. Acceptance Criteria

### Global (both experiences)
- `npm run typecheck`, `lint`, `check:catalog`, `check:i18n`, `verify:storefront` (95/95),
  `verify:admin` (193/193) all pass.
- Screenshots at 390 / 768 / 1024 / 1440 for every touched route reviewed per phase.
- No business-logic diff: cart, checkout, auth, order, admin routes behave identically.

### Mobile (390px)
1. First screen shows brand statement + at least one purchasable product (hero spotlight preserved).
2. Circular carousel: ~4 full + peeking circle, snap-scrolls horizontally, no page-level horizontal
   overflow anywhere on the homepage.
3. PDP: price + add-to-cart reachable within one screen via fixed buy bar; gallery swipes with dots.
4. All tap targets ≥44px; bottom tab bar never overlapped by content.

### Desktop (≥1024px)
1. Hero collage composition intact and visually richer (tinted field), content fills ~94% at 1440.
2. Category carousel: ≥9 circles visible, no arrows needed but present if added; hover ring feedback.
3. PDP: main image ≤560px tall, info column balanced, zoom opens uncropped original.
4. Brand band: ≥10 logo chips in two rows; related/featured grids keep 4–5 column density.

### Circular carousel (explicit)
- See §6 acceptance items 1–5. Any square-tile rendering of the homepage category section = fail.

### Square categories grid (explicit)
- All `/categories` tiles equal squares, 16px radius, uniform treatment at every breakpoint;
  count/tagline logic unchanged; admin picker flow unaffected.

### Brand discovery (explicit)
- Chips use real `logoKey` marks where present, verified-fetch pipeline intact, initials fallback
  styled and never an empty/broken image; `/brands/[slug]` listing functional.

### Product details (explicit)
- Discount display, availability gating, quantity stepper, add-to-cart confirmation, live region,
  buy bar, related grid: zero behavioral change (covered by `verify:storefront`).

---

## 15. Risks and Recommendations

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| 1 | Rebreaking desktop while styling mobile (previous failure) | **High** | Two-composition rule (§10.3); per-phase 4-viewport screenshot matrix; additive-only CSS; never unify hero/PDP compositions |
| 2 | Carousel misread as square grid again (previous failure) | **High** | §6 is a measured spec with numeric acceptance; implement `CategoryCircleRail` as a *new* component, delete the old rail usage so it cannot regress |
| 3 | `sizes`-hint drift → blurry or oversized downloads | Medium | Update constants in same commit; `check:catalog` + manual network-tab spot check |
| 4 | Category image upload expectations | Medium | Blueprint keeps association-only (ADR 0006); if owner insists, separate phase: upload endpoint + sharp re-encode + inventory registration — never inside this redesign |
| 5 | Brand logo gaps for long-tail brands | Low | Initials fallback is intentional and honest; do not hotlink or scrape at render time |
| 6 | i18n parity breaks from new UI strings | Medium | All copy via `dictionaries.ts`; `check:i18n` gate per phase |
| 7 | Campaign band inventing backend | Medium | Phase-gated (R6); only existing settings patterns; skip without owner content |
| 8 | `next build` security-advisory retry confusing verification | Low | Documented project behavior — treat first-failure as retry, per `docs/implementation-plan.md` |
| 9 | OfferCarousel regression while adding new rails | Low | OfferCarousel is untouched; new rails are separate components |
| 10 | Dev-environment drift (local db/seed needed for screenshots) | Low | Verified recipe: `npm run dev:db` → `db:migrate` → `db:seed:catalog` → `seed:discovery` → `npm run dev` |

### Recommendations summary

1. Implement in the R1→R5 order; R1 alone delivers the owner's most-wanted visual change safely.
2. Extend, never replace, the token system — it is the reason the storefront is coherent.
3. Keep both mobile and desktop acceptance checks in every phase's definition of done.

---

*End of blueprint. No code was modified during this audit (working tree untouched except pre-existing
untracked `.tmp-dbcheck.ts`; reference screenshots saved under `/tmp/refs/`).*
