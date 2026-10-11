# Design system

Status: refined in the mobile/discovery phase (2026-10-11). Tokens live in `src/app/globals.css`; component styles are CSS Modules. Items marked *not built* are explicitly deferred.

## Direction

Product-led, calm, precise. The shopper compares brand, pack size, price and availability without hunting, and purple/pink are used deliberately rather than painted over every surface. Authentic product photography carries the visual weight.

## Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#A680FF` | Approved brand anchor. Accents and thin borders. |
| `--brand-secondary` | `#F6B3CC` | Approved accent anchor. Sparse supporting surfaces. |
| `--color-action` | `#56358C` | Filled actions with white labels. |
| `--color-action-hover` | `#462A75` | Action hover. |
| `--color-action-soft` | `#F3EDFF` | Announcement strip, tinted panels, active chips, icon wells. |
| `--color-accent-soft` | `#FDEEF3` | Pink tint for decorative surfaces. |
| `--color-ink` | `#201A29` | Primary text. |
| `--color-ink-muted` | `#6A6172` | Secondary text. |
| `--color-ink-subtle` | `#857E8D` | Tertiary text and captions. |
| `--color-page` | `#FAF8FC` | Page canvas. |
| `--color-surface` | `#FFFFFF` | Cards and panels. |
| `--color-surface-sunken` | `#F4F1F8` | Image wells and inset areas. |
| `--color-border` | `#E4DFEB` | Decorative dividers only. |
| `--color-border-strong` | `#877B91` | Essential control outlines. |
| `--color-focus` | `#7952B3` | Focus ring, 2px with offset. |
| `--color-success` / `-soft` | `#23633E` / `#E8F3EC` | Savings and confirmations. |
| `--color-danger` / `-soft` | `#9B263E` / `#FBEAEE` | Removal and destructive actions. |
| `--color-warning` / `-soft` | `#755100` / `#FDF3E2` | Unverified data notices. |

### Measured contrast

| Pair | Ratio | Verdict |
| --- | --- | --- |
| White on `#A680FF` | 2.94:1 | **Fails** - never used for text |
| White on `#F6B3CC` | 1.72:1 | **Fails** - decorative only |
| Ink on `#A680FF` | 5.76:1 | Passes AA |
| White on `#56358C` | 9.20:1 | Passes AAA - all filled actions |
| Muted on white | 5.89:1 | Passes AA |
| Ink on `#F3EDFF` | 14.2:1 | Passes AAA |

## Typography

- **English: Inter** (variable), **Bangla: Noto Sans Bengali**, both self-hosted via `next/font`.
- **Weights are restricted to 400 / 500 / 600 / 700.** Inter is variable but Noto Sans Bengali ships only these four, so an intermediate value (550/650) renders at *different* effective weights in the two scripts. This was a real defect and is now prevented.
- **No letter-spacing on Bengali text.** `html[lang='bn']` resets tracking for headings, overriding the global `-0.01em`.
- Scale: 12 / 13 / 15 / 16 / 18 / 22 / 28 / 34 px. Body 15px, 1.6 leading (1.7 for Bangla).
- No fixed-height text containers, so Bangla conjuncts and long product names never clip.

## Price hierarchy

The price is the loudest commercial fact on every surface. Hierarchy is carried by **size, weight and contrast** - not by colour, badges or decoration. The same three-step structure is used on cards, the product page and the cart, so a shopper learns it once.

| Surface | Current price | Comparison price | Saving |
| --- | --- | --- | --- |
| Product card | `--text-lg`, weight 700, full-contrast ink | `--text-sm`, subtle, struck through | `--text-xs`, success colour |
| Product detail | `--text-2xl` (`--text-3xl` from 880px), weight 700 | `--text-md`, subtle, struck through | `--text-sm`, success colour |
| Cart line / total | `--text-lg` / `--text-xl`, weight 700 | - | - |

Rules that hold everywhere:

- All money uses `font-variant-numeric: tabular-nums` and `white-space: nowrap`, so figures never break across lines and columns stay aligned in both digit systems.
- The comparison price is struck through **only** when it is genuinely greater than the current price. The card and the detail page both gate it on the derived saving being non-null, so a discount cannot be displayed that does not exist.
- Savings are always derived in `src/lib/money.ts` from stored integer poisha. Nothing is stored as a precomputed discount, and percentages are floored so they never overstate.
- Prices never change with locale; only the digit system and the `৳`/`Tk` prefix do.
- Prices stay large enough to dominate but small enough not to crowd the product name or the add-to-cart action. Card heights stay consistent because the price block is pushed to the bottom of the card with `margin-top: auto`.

## Spacing, shape, motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px.
- Radii: 4 / 8 / 12 px plus a pill for filter chips only.
- Two shadows only. Motion: 120ms state feedback, 180ms panels. `prefers-reduced-motion` collapses all durations and switches the shelf scroll to instant.

## Logo and favicon

Status: redesigned in the brand-mark phase (2026-10-11).

### Concept

The identity is a **crown of three petals** over a **body band** - a queen bee abstracted to her two defining ideas, regalia and a striped abdomen, without drawing a literal insect.

| Element | Reading | Colour |
| --- | --- | --- |
| Centre petal, tallest and forward | The queen, and the regal peak of a crown | `--color-action` `#56358C` |
| Two side petals, symmetric and lower | Crown points; also the mirrored wings of a bee in flight | `--brand-primary` `#A680FF` |
| Rounded band beneath | The striped abdomen of a bee; a cosmetic swatch | `--brand-secondary` `#F6B3CC` |

Deliberate exclusions: no clip-art bee, no stripes-as-literal-lines, no gradients, no facial features, no drop shadow. Three shapes carry the whole mark, so it stays legible when reduced.

The three shapes map one-to-one onto the approved palette, which is what keeps the mark feeling native to the storefront rather than applied to it.

### Assets

| Asset | Path | Use |
| --- | --- | --- |
| Horizontal lockup | `public/brand/logo.svg` | Header. 173x40 viewBox, symbol plus wordmark. |
| Standalone symbol | `public/brand/logo-mark.svg` | Compact placements. 40x40. |
| Favicon | `public/brand/favicon.svg` | Browser tab. 32x32, reversed symbol on a `#56358C` tile. |

`public/brand/logo-dark.svg` was **removed**: no surface used it, and an unreferenced asset invites drift from the real mark. The favicon is the reversed variant for anyone who needs light-on-dark.

Asset paths are unchanged from the previous mark, so the header `<img>` and the metadata icon needed no path changes.

### Wordmark

The wordmark is **real vector outlines**, not SVG `<text>`. This matters: inside an `<img>`, `font-family: var(--font-latin)` cannot resolve, so the old lockup silently rendered its wordmark in a system font while the rest of the site used Inter. The outlines are instanced from the project's own self-hosted Inter variable font at weight 600 - the same family and the same weight the storefront uses for headings - so the wordmark and the interface now genuinely match.

Outlined text is not real text, so the SVG carries `role="img"` and an `aria-label` of `QueenBee's` and the header `<img>` repeats `alt={t('common.brand')}`. The accessible name is preserved in both locales.

### Header sizing rules

- The lockup renders at a fixed 32px height with `width: auto` and **`object-fit: contain`**.
- The global `img { max-width: 100% }` rule caps the box on narrow screens while the height stays fixed, which would otherwise squash the artwork (measured 3.04:1 against a true 4.33:1 at 320px). Contain keeps the drawn mark proportionate inside whatever box it gets; the leftover space reads as letterboxing, not distortion.
- Below 360px the height steps down to 26px so the lockup and the action buttons keep room.
- The favicon is verified to 16px: the tile remains the dominant colour on both light and dark tab backgrounds, and the reversed symbol keeps its ink.

## Components

- **AnnouncementBar** - slim strip above the header, driven by `src/data/announcements.ts`. Present on every route.
- **ProductPhoto** - one `<picture>` for all catalog imagery: WebP source, JPEG fallback, explicit dimensions, `sizes` hints, lazy by default and eager for the detail hero.
- **ProductCard** - 3:4 photo, brand eyebrow, title, pack, price row and a derived saving. No badges, ratings or urgency.
- **FeaturedShelf** - **exactly one row**, horizontally scrollable, group controls that disable at each end. No clones, no autoplay, no dependency.
- **QuantityStepper** - accessible minus/plus with a numeric input clamped to 1..20.
- **Header** - sticky. Inline nav and search appear from **1024px**; below that both live in a focus-trapped drawer.

## Layout width system

Two tokens in `globals.css` define the content grid, and every piece of page
chrome reads them - header, announcement strip, shell, footer. No component sets
its own horizontal padding, so no section can drift out of alignment.

| Token | Value | Rationale |
| --- | --- | --- |
| `--container` | `1440px` | Derived from the reference capture, not chosen by eye: that screenshot fills ~94% of its viewport, and at its apparent CSS width (~1320px) a 1440px container does not bind, so our content lands at the same ~94% fill. |
| `--gutter` | `clamp(16px, 2.5vw, 40px)` | Responsive gutters rather than fixed margins. 16px on phones (matching the reference), growing with the viewport and capping at 40px so wide screens gain content instead of ever-larger empty edges. |

The previous system was a 1200px container with fixed 16px/24px padding, which
left content at 80% of a 1440px viewport and only 60% at 1920px.

The container cap, not the grid's column count, is what stops cards growing.
Product cards are 136px on a phone and 322px at 1920px - bounded by the cap
rather than inflated by the extra width.

**`auto-fill` was tried and rejected.** Bounding card width with
`repeat(auto-fill, minmax(220px, 1fr))` did keep cards ~224px, but because the
homepage selections are curated at 4 and 8 items, a 5- or 6-column track left
1-4 trailing holes in the final row (at 1920px the 8-item row filled only 4 of 6
columns). Explicit column counts were kept and the container cap does the work.

## Responsive behaviour

Breakpoints: 600px (category grid 2 columns), 720px (category section appears, footer 3 columns), 880px (hero splits, catalog sidebar, PDP and cart two columns), 1024px (header nav + search, grid 4 columns, shelf 4 visible).

Featured shelf visible columns: 2 on mobile, 3 on tablet, 4 on desktop - always one row.

### Why the desktop header starts at 1024px

The full desktop header - brand, inline navigation, search and action buttons -
needs roughly 1000px of content width to fit on one row. Measured: at 880px it
required ~1003px but the container offered only 858px, so the action group
wrapped and the header grew to 104px.

At **1024px** the inline navigation and the drawer trigger therefore swap
together, on a single 64px row. Below it the drawer is the navigation surface,
and because the drawer carries both the search field and every category, nothing
is unreachable at those widths. Verified in both locales: the Bangla navigation
is 441.9px and the English 446.7px, so the breakpoint holds for the wider of the
two.

The header search field stretches to fill the space between the navigation and
the action buttons, capped at 720px. It previously held its intrinsic ~284px
while sitting in a `1fr` track with `justify-self: end`, which meant it spilled
leftwards and overlapped the navigation once the track fell below that width
(measured -47px at 1024px). Stretching it fixed the overlap and the 348-500px
dead gap at wide widths in one change.

### Mobile-first decisions

- **The homepage category section is hidden below 720px.** Rationale: the mobile header collapses into a drawer that already lists every category, so the section would be a second navigation surface consuming most of the first screen. 720px is deliberately the same breakpoint at which the header's own category navigation appears, so a category link is always reachable through exactly one of the two surfaces. The hero's "See categories" anchor is hidden on the same breakpoint rather than pointing at a target that is not rendered. Category filtering on `/products` and the category routes are untouched.
- **Header height, hero padding and the display type size all step up only where the measure allows it**, rather than starting large and being shrunk for mobile.

### Overflow discipline

Two traps are worth remembering because both caused real page overflow:

1. **Nested grids default to `min-width: auto`.** A grid item cannot be narrower than its content's minimum unless `min-width: 0` is set. Without it, the shelf reported its whole column set as its minimum width and pushed the page sideways. Both `.wrap` and `.scroller` set it explicitly.
2. **`overflow-x: auto` clips visually but does not stop the content contributing to an ancestor's scroll width.** The shelf needed `contain: layout paint` before the row stopped widening the page. Containment fixes the cause; `overflow: hidden` on the parent would only have hidden it.

Verified with no horizontal overflow on `/`, `/products`, `/cart`, `/checkout`, a product page and a category page at 320px, and across 320-1440px.

Touch targets: primary controls at least 40px; breadcrumb links raised to a 24px minimum (WCAG 2.5.8).

*Unverified:* real iOS Safari and Android Chrome, 200% zoom reflow, and screen-reader output on real assistive technology.
