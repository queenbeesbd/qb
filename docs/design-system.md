# Design system

Status: refined through Phase 5 layout-width work (2026-10-11). Tokens live in `src/app/globals.css`; component styles are CSS Modules. Items marked *not built* are explicitly deferred. Current overall state and verification limits: `docs/project-status.md`.

## Direction

Product-led, calm, precise. The shopper compares brand, pack size, price and availability without hunting, and purple/pink are used deliberately rather than painted over every surface. Authentic product photography carries the visual weight.

## Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#C8B6FF` | Owner-chosen light lavender (2026-11-05). Surfaces and accents; ink rides on it. |
| `--brand-secondary` | `#F6B3CC` | Approved accent anchor. Sparse supporting surfaces. |
| `--color-button` | `#C8B6FF` | Storefront filled controls. Ink on it, never white. |
| `--color-button-hover` | `#B9A4FF` | The same field one step deeper. |
| `--color-button-ink` | `#201A29` | Label and glyph on a filled storefront control (9.3:1). |
| `--color-action` | `#56358C` | Navigation states, saturated marks and link ink. |
| `--color-action-hover` | `#462A75` | Action hover. |
| `--color-action-soft` | `#F3EDFF` | Tinted panels, active chips, icon wells. |
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
| White on `#C8B6FF` | 1.81:1 | **Fails** - never used for text or a glyph |
| White on `#F6B3CC` | 1.72:1 | **Fails** - decorative only |
| Ink on `#C8B6FF` | 9.34:1 | Passes AAA |
| White on `#56358C` | 9.20:1 | Passes AAA - all filled actions |
| Muted on white | 5.89:1 | Passes AA |
| Ink on `#F3EDFF` | 14.2:1 | Passes AAA |

## Typography

- **Inter** (variable) for the interface, **Noto Sans Bengali** kept for Bengali *data*, both self-hosted via `next/font`. The interface is English only since Phase 28, but a product name, category name or customer-entered line may still be Bengali, so the second family is not a language feature - it is what keeps owner and customer text from falling back to a system font.
- **Weights are restricted to 400 / 500 / 600 / 700.** Inter is variable but Noto Sans Bengali ships only these four, so an intermediate value (550/650) renders at *different* effective weights across the two scripts. This was a real defect and is now prevented.
- **No letter-spacing on Bengali text.** The document is `lang="en"` since Phase 28, so the `html[lang='bn']` reset no longer fires; the rule stays as the guard it was written to be, and no Bengali heading is letter-spaced by the interface.
- Scale: 12 / 13 / 15 / 16 / 18 / 22 / 28 / 34 px. Body 15px, 1.6 leading.
- No fixed-height text containers, so Bengali conjuncts and long product names never clip.

**One interface language.** There is no language toggle, no locale store and no second dictionary (Phase 28). The header's action cluster holds the search, account and cart controls on a desktop, and the cart alone on a phone, where the modal drawer (ADR 0026) lists home, the catalog, the category index, every department, brands, cart and account. A stored `queenbees.locale.v1` value from an older visit is inert: nothing reads it, and `verify:storefront` asserts that writing it changes nothing.

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
- Two shadows only. Motion: 120ms state feedback, 180ms panels. `prefers-reduced-motion` collapses all durations.

## Logo and favicon

Status: the owner's `logo.jpeg` is the identity (2026-11-05), in the header, the **admin rail** and the browser tab. The drawn crown mark described below is retired from every surface; `logo.svg` and `logo-mark.svg` remain only as reference files.

### Concept

The identity is a **crown of three petals** over a **body band** - a queen bee abstracted to her two defining ideas, regalia and a striped abdomen, without drawing a literal insect.

| Element | Reading | Colour |
| --- | --- | --- |
| Centre petal, tallest and forward | The queen, and the regal peak of a crown | `--color-action` `#56358C` |
| Two side petals, symmetric and lower | Crown points; also the mirrored wings of a bee in flight | `--brand-primary` `#C8B6FF` |
| Rounded band beneath | The striped abdomen of a bee; a cosmetic swatch | `--brand-secondary` `#F6B3CC` |

Deliberate exclusions: no clip-art bee, no stripes-as-literal-lines, no gradients, no facial features, no drop shadow. Three shapes carry the whole mark, so it stays legible when reduced.

The three shapes map one-to-one onto the approved palette, which is what keeps the mark feeling native to the storefront rather than applied to it.

### Assets

| Asset | Path | Use |
| --- | --- | --- |
| Horizontal lockup | `public/brand/logo.svg` | Retired from the header on 2026-11-05; the file remains for reference. |
| Circular brand mark | `public/brand/logo-round-96.jpeg`, `logo-round-192.jpeg` | Header 48px, admin rail 40px. Generated from the owner's `logo.jpeg` by `npm run assets:brand`; drawn in a circular box with `object-fit: cover`, so any square upload is centre-cropped to the circle. |
| Standalone symbol | `public/brand/logo-mark.svg` | Retired with the drawn mark; kept for reference only. |
| Favicon | `public/brand/favicon-32.png`, `favicon-192.png` | Browser tab, generated from `logo.jpeg`. **Round**, with a transparent outside, so it sits on a light or dark tab without a white square. |
| Apple touch icon | `public/brand/apple-touch-icon.png` | 180x180 home-screen icon. Square and opaque because iOS applies its own rounded mask and flattens transparency. |

`public/brand/favicon.svg` (the reversed crown tile) and `public/brand/logo-dark.svg` were **removed**: neither is referenced, and an unreferenced asset invites drift from the real mark. `npm run assets:brand` writes every raster asset above from the owner's master, so all of them move together when the logo changes. `src/app/layout.tsx` links the icons through the metadata `icons` field; there is no `app/icon.*` file, so there is exactly one declaration.

### Wordmark

The wordmark is **real vector outlines**, not SVG `<text>`. This matters: inside an `<img>`, `font-family: var(--font-latin)` cannot resolve, so the old lockup silently rendered its wordmark in a system font while the rest of the site used Inter. The outlines are instanced from the project's own self-hosted Inter variable font at weight 600 - the same family and the same weight the storefront uses for headings - so the wordmark and the interface now genuinely match.

Outlined text is not real text, so the SVG carries `role="img"` and an `aria-label` of `QueenBee's` and the header `<img>` repeats `alt={t('common.brand')}`. The accessible name is preserved at every width.

### Header sizing rules

- The lockup renders at a fixed 32px height with `width: auto` and **`object-fit: contain`**.
- The global `img { max-width: 100% }` rule caps the box on narrow screens while the height stays fixed, which would otherwise squash the artwork (measured 3.04:1 against a true 4.33:1 at 320px). Contain keeps the drawn mark proportionate inside whatever box it gets; the leftover space reads as letterboxing, not distortion.
- Below 360px the height steps down to 26px so the lockup and the action buttons keep room.
- The favicon is the same logo, and it is verified at 32px: the outer corners are fully transparent, the drawn circle and ink survive at 16px, and `verify:browser` measures exactly that rather than trusting the file.

## Components

- **AnnouncementBar** - one left-aligned line above the header, carrying the owner's saved line only. No background and no second rule: the text starts on the same gutter as the brand, so it reads as the shop's own news rather than a promotion banner (owner decision, 2026-10-23 - it was a centred tinted strip). Absent entirely when that line is empty or switched off (ADR 0020).
- **ProductPhoto** - one `<img>` with a **WebP-only `srcSet`** (320 / 600 / 1050): explicit dimensions, `sizes` hints, lazy by default and eager for the detail hero. A card downloads 600, a 116px circle downloads 320, and the detail view asks for 1050.
- **ProductCard** - brand eyebrow, title, pack, price row and a derived saving. **One 4:5 frame everywhere** (owner direction, 2026-11-05): `CARD_FRAME` and `LISTING_CARD_FRAME` are the same measurement, so a product looks the same on the homepage, in a carousel, in a category and in the listing. Homepage cards also carry their own **Add to cart** control (outlined, 40px, disabled and labelled when unavailable). No rating, urgency claim or invented badge; the listing's discount tag is derived from the two stored prices.
- **Featured row** - the owner's five picks on the standard grid, one product per department. **No carousel**: there is no sixth card hiding off screen, so there are no controls, no horizontal bar and no scroll state to manage (owner decision, 2026-10-23 - it replaced a six-card scrolling shelf).
- **QuantityStepper** - accessible minus/plus with a numeric input clamped to 1..20.
- **Header** - sticky on desktop, static on a phone. From 1024px it is one row in reading order: logo, category navigation immediately after it, then search and account at the far end. The links are centred **vertically** - each is a 40px control - which is the correction the owner asked for after seeing a viewport-centred first attempt. The search field is a real 240px input at 1200px and a compact link to the catalog's own search between 1024 and 1199px. Below 1024px it holds brand, a full-width search field and the two icon controls.
- **StorefrontTabBar** - the phone's only navigation: fixed to the bottom, five destinations (Home, Shop, Categories, Cart, Account), 64px targets, cart count on its tab, `aria-current` on the current section, and `env(safe-area-inset-bottom)` reserved. The shell reserves its height so it never covers the footer.
- **AuthShell** - the two-panel frame shared by sign in, registration and the one-time-code page: a lavender intro panel and a white form panel, stacked on a phone with the intro reduced to the brand and one sentence.

## Homepage revision (2026-11-02, owner direction)

The homepage is one canvas, one card size and one carousel. This section supersedes the homepage parts of
the earlier "storefront discovery" notes where they disagree.

**One surface, no tinted fields.** The hero, the offer row and the brand row had pastel lavender and pink
backgrounds. The owner's feedback: it read as a sequence of promotions rather than as one shop, so **no
homepage section carries a background**. Space and type separate the rows. The hero now has a composition
of its own (the owner's image carousel, below) and sits on the page canvas like every other section.

**The hero is an image carousel (Phase 51).** One 16:9 banner at a time, full width of the page container,
with the owner's stored order as the sequence. It is a CSS scroll-snap track like the other shelves, so a
phone swipes it without custom gesture code and the keyboard arrows work when the track has focus. From
720px two 44px circular arrows overlay the banner; on a phone they stay hidden and the dots are the visible
control. The dots sit on the image's lower-left corner as in the owner's reference, are 32px targets with an
8px mark, and state aria-current. **Since 2026-11-05 the hero advances every 9 seconds and loops** (hover/focus pause it, `prefers-reduced-motion` stops it); there is no play/pause control. It is still one real scroll, not a separate animation, and a single
banner renders no dots. The h1 remains in the section for the document outline but is visually hidden,
because the banner's message is inside the owner's artwork.

**No section explains itself.** Every heading used to carry a sentence - "Priced below their published
comparison price", "Picked from the catalog by the shop", "The most recently added products in the
catalog". They are gone from the homepage: a heading, and when there is more, exactly one way in. The
dictionary keys were removed with them rather than left as dead copy.

**One card size everywhere: the featured row's.** The featured row is a static `ProductGrid` (five cards
from 1200px, three from 720px, two on a phone) and its card is the homepage's measurement. The carousel
reproduces that track exactly (`Carousel`'s `size="product"` is `calc((100% - 4 * gap) / 5)` from 1200px,
`(100% - 2 * gap) / 3` from 720px and `(100% - gap) / 2` below), so a card inside a shelf and a card inside
the grid are the same width at every breakpoint.

**Every row that holds more than a screenful is a carousel** - one component, `src/components/Carousel.tsx`:

| section | cards | phone | desktop |
| --- | --- | --- | --- |
| On offer | 10 | 5 pages of 2 | 2 pages of 5 |
| Shop by category | 20 | 15 circles, then "View all" | 20 circles, then "View all" |
| Shop by brand | 20 | 15 circles, then "View all" | 20 circles, then "View all" |
| Recently added | 10 | 5 pages of 2 | 2 pages of 5 |

It is a CSS scroll-snap track, not a JavaScript slider: the browser supplies momentum, keyboard arrows and
focus order, and the previous/next buttons only call `scrollBy`. Dots are buttons and state `aria-current`;
they appear whenever there is more than one page, at every width. The track **measures its own geometry**
(slide width and `column-gap`) to decide the page count, so a caller never declares a page size.

**The two discovery rails are carousels at every width, with their arrows beside the dots** (owner
direction, 2026-11-12). `controls="pager"` moves the pair out of the artwork: floating a 40px button on a
116px circle covered the tile's own initial or logo, which read as a defect rather than a control. A
product shelf keeps the overlay pair, where the button sits over a card's photograph.

**Twenty circles on a desktop, fifteen on a phone, then the way out.** `RAIL_DESKTOP_LIMIT` /
`RAIL_MOBILE_LIMIT` live in `src/features/catalog/home/rail-limits.ts`; the server sends the desktop list
and `Carousel`'s `mobileLimit` hides everything from the sixteenth slide below 720px in CSS
(`:nth-child(n + 16):not(:last-child)`), so nothing measures the viewport and the hidden photographs are
never fetched. When the shop has more than the phone draws, the last slide is the shared `SeeAllCircle` -
same 116px/62px geometry, a pale lavender field with a drawn arrow and the "View all" label - linking to
`/categories` or `/brands`. It reads as a control, never as a tile with a missing photograph, and a shop
with fewer than sixteen items shows them all with no control at all.

**Featured and "More to explore" are the two sections that are not carousels**, and on a phone they publish
an **even** number of cards so the two-column grid fills its rows: featured draws four of five
(`li:nth-child(n + 5)` is hidden below 720px) and "More to explore" draws eight of ten (hides `n + 9`).
Nothing is padded, repeated or re-ordered to make the count: the hidden cards are shown from 720px, where
the grid holds three and five columns.

**The category circle's hover is drawn inside the circle.** The previous version ringed the hovered tile
with a `box-shadow` at a 2px offset and lifted it 2px; a scroll container clips on the cross axis, so the
ring was cut off at the top and bottom - the defect the owner photographed. The treatment is now a border
colour on the circle's own box, a photograph zoom clipped by the circle, and an **inset** focus outline. No
homepage carousel moves or shadows a slide outside its own box, and every track carries 4px of vertical
padding so a focus ring has room.

**The brand row is a card per brand** (owner reference: Ghorer Bazar's "Our Brands", anatomy only, not
styling): the mark centred on a white card, the brand's name beneath it and its product count under that,
four across on a desktop. The brand's own soft tint stays as a rounded logo chip inside the card, and the
name is always drawn - a brand with no logo shows one large display-face letter on a pale plate derived from its slug, and the name is what says whose mark it is.

**The footer is short (owner feedback: "very lengthy").** The department list is gone - five links into
categories the header, the tab bar and the index already reach - leaving the shop's own line, two groups of
three links (Shop / Account) and the year. On a phone the two groups sit side by side under the brand
block, so the whole footer is four short rows instead of two stacked columns of links.

**Brands are their own destination (owner decision).** `/brands` already existed; what changed is that it
is now a first-class route rather than a block inside `/categories`: it is the last item of the desktop
header navigation, the fourth tab of the phone bar (after Categories), and a link in the footer. The brand
teaser was **removed** from `/categories`, which now answers one question - which departments does the shop
hold - and still links to the brand index.

**The phone tab bar carries six destinations**: Home, Shop, Category, Brands, Cart, Account. Six tabs on a
360px screen leave ~60px each, so the category tab's label is the short word (`nav.tabCategories` =
"Category") rather than a truncated "Categorie…"; the measured label widths are checked at 360 and 390px and
none clips.

**The bar wears the brand (owner direction, 2026-11-05).** It is `--brand-primary` (#c8b6ff) rather than a
white strip, with labels and icons in `--color-ink` - 9.3:1 on that lavender. The current destination is a
**deep-lavender capsule behind the icon** (`--brand-primary-deep`, 40x30, `border-radius: 999px`) with a
white glyph (4.7:1) plus a 700-weight label. The cart count is `--brand-secondary` pink with ink on it.
**White text on the light lavender is never used** (1.8:1); white is confined to the deep capsule.

The bar's craft rules, after the 2026-11-05 refinement:

- The surface lifts ~12% at its top edge and carries a 1px light inset highlight; **no dark hairline** under
  the content - it drew a second line across every screen.
- **The active state never fills the tab cell.** A cell is ~65x64, so a full-cell pill is nearly square and
  reads as a bubble pressed against the label. A white capsule was rejected on sight by the owner (it read as a hole in the bar), so the active state stays in the brand's own hue. The capsule hugs the 22px icon and the label keeps the cell's
  full width.
- Tabs answer a press (`scale(0.94)`, 120ms) and hover is gated behind `(hover: hover) and (pointer: fine)`,
  because on a touch screen a hover wash fires on tap and looks like a stuck selection.

## Catalog listing (2026-10-30)

The listing is one view - `CatalogView` plus `src/features/catalog/listing/` - shared by
`/products` and `/categories/[slug]`. Both routes load the same catalog snapshot, parse the same
query and pass only one page of products plus server-derived facet counts, so a filter, a count and a
card can never disagree.

**Page anatomy.** Breadcrumb, title, optional category blurb, result count and page summary, then a
single rule. The body is a two-column grid: a **252px** rail from 1024px, with a **28px** gap that
opens to **32px** at 1280px. The rail is **sticky** (owner direction, 2026-11-05) and capped to the
viewport: with its secondary sections collapsed it is far shorter than the screen and nothing scrolls
inside it; when every section is open on a short window the rail scrolls itself rather than losing its
last rows. The page remains the primary scroll container. The rail was previously static: the page was the
only scroll container, so there is one scrollbar and no nested panel to fight. It is a bordered white
panel with section dividers, not a strip of pills. Below 1024px the rail does not exist; the Filters
button opens a modal drawer.

The rail opens as a compact contents list: **Category** is open, while **Brand**, **Price** and
**Availability** start collapsed. A section that has a filter applied opens by itself on load and
states its value in its own header (`Brand 1 selected`, `Price Tk 100 - Tk 700`, `Availability In
Stock`), so disclosure never hides state. With no filters applied the whole rail is 511px tall at
1280x800, fully inside the first screen; opening Brand makes it taller, and the page scrolls normally.

**Control scale.** Search, sort and the Filters button are **44px**; section headers are **40px**
targets; rail rows are **32px** on a desktop and **40px** in the drawer; price inputs are 36px on the
desktop (40px in the drawer) and Apply is 32px (40px in the drawer); pagination cells and steps are
40px. Section headings are 11px uppercase with 0.08em tracking; filter labels are 13px; counts and
header summaries are 10.5-11.5px tabular numerals in muted ink. Radii are 8px for controls and cards,
6px for rows and chips; chips are not pills.

**Filter semantics.**

- **Category** is a single choice and a navigation, not a checkbox group. Rows are real links with
  counts; the current one is marked `aria-current="page"` with a 2px action border and the action-soft
  wash. A link always resolves to `/categories/{slug}`, so a filter change never leaves the address
  bar on a query-string imitation of the page. "All categories" is the only way back to `/products`.
  Since Phase 31 the accessor exposes `parentId` and the owner has a parent picker, so the rail lists
  **departments only** - subcategories are reached through their parent's page and are not offered as
  peers. The active category is always kept visible, including when it is a child. After eight rows it
  offers `Show N more categories`, always keeping the active row visible. A parent page shows its
  children as a link strip above the grid.
- **Brands** are multi-select checkboxes over a searchable list. The section starts collapsed because
  it is the long one; it opens automatically when a brand is applied. Inside, the first six are
  visible; selected brands are pinned in a "Selected brands" group with its own Clear control above
  the rest; `Show N more brands` reveals the remainder with a chevron. The option carries a real
  product count and a native checkbox (visually restyled, keyboard and screen reader intact). Counts
  come from the page's category scope, so the number beside a brand is the number choosing it can
  yield.
- **Price** starts collapsed and is hidden entirely when every product in scope has one price. It
  offers two whole-taka fields and a two-thumb range slider. The bounds row carries the catalog range,
  a Reset when a range is applied, and a compact **Apply price** (the full-width button was removed:
  it added a whole control row for no extra meaning). A decimal, a formatted amount or an inverted
  range is a stated refusal, never a guessed boundary. The filter is integer poisha; the URL carries
  whole taka.
- **Availability** starts collapsed and provides the owner's two real states, In Stock and Out of
  Stock, with counts. The unverified `unknown` display state is not offered as a filter because it is
  not a state the shop can choose.
- **Clear** is available in three places and they mean the same thing: the rail's Clear filters, the
  chips' Clear filters, and the empty state's recovery link (which goes to `/products`). Clearing keeps
  the category page you are on and the sort you chose; it removes the search term and the facets.

**Toolbar.** A 44px search field with a leading submit button, a clear control that appears only when
there is text, and Enter support; a sort `<select>`; the phone Filters button with an active count;
then "Showing 1-48 of N" and the active-filter chips. Each chip removes exactly its own filter and is
synchronised with the rail. Search is committed on submit rather than on every keystroke: a
server-rendered listing does not need a debounce, and a half-typed term would overwrite the URL and
the history.

**URL contract.** `q`, repeated `brand`, `min`/`max` (whole taka), repeated `availability`,
`sort` and `page`. The category is a route, never a generated query parameter; `/products?category=`
is still accepted for older links and canonicalises on the next filter change. Any filter change
resets the page to 1 and {`router.push`} is called with `scroll: false` so the shopper does not lose
their place. The selected controls update optimistically inside the navigation transition; the result
set, heading and counts stay the server's until it answers, and the grid is dimmed while pending.

**Card price and saving (2026-11-05).** The current price is set in `--color-action` - the shop's
accessible purple, 7.4:1 on white, the same ink every filled action uses - rather than the literal
`--brand-primary` (#c8b6ff), a light field that carries ink rather than white.
The saving ("Save Tk 100 · -8%") is a quiet chip on `--color-accent-soft` (the secondary anchor's soft
tint) with a pill radius, ink text at ~15:1, so the shape carries the emphasis and the price stays the
loudest fact on the card.

**Cards.** The listing and the homepage both use `ProductCard` at the same **4:5** frame (2026-11-05);
`LISTING_CARD_FRAME` and `CARD_FRAME` are one value so the two surfaces cannot drift apart again: brand
eyebrow, two-line title, pack, current price,
struck comparison only when the derived saving is genuine, a "Save ..." line and an out-of-stock
label. The listing adds a derived `-N%` tag over the photograph; it is `aria-hidden` because the
saving line states the same fact as text. No rating, urgency claim or invented badge is added.

**Phone.** Below 1024px the shell's global search is hidden on listing routes, because the listing's
own search sits directly under it and two search fields with different scopes read as one broken
control. The listing search owns that row; Filters and Sort share the next. The drawer is a right-hand
modal sheet: focus moves to Close, Tab is trapped, Escape closes, body scroll is locked, Apply commits
the draft, Reset clears it, and focus returns to the Filters button. Category rows in the drawer are
links, so they navigate immediately and carry the draft's other facets. No filter is visual-only.


## Ratings and reviews (2026-11-10, ADR 0035)

**Five stars are drawn, never set in a glyph font.** `RatingStars` builds each star as an SVG path in a
24-unit box, so a half star is exact: the star is filled in the empty tone and a polygon covers precisely
its left half (the top point, the centre-bottom point and the three left vertices), which needs no mask,
no clip id and no painted-over background. `★★★½` therefore joins on the star's own vertical axis
instead of a stepped approximation, and the row does not depend on a font a device may round.

| Concern | Rule |
| --- | --- |
| Filled tone | `--color-action` (#56358c, 7.4:1 on white). Gold is the universal rating colour and would be the obvious literal choice, but this palette has two anchors and no gold; the star's shape carries the meaning |
| Empty tone | `color-mix(in srgb, var(--color-ink-muted) 70%, var(--color-surface))` = #97909c, **3.09:1** - the non-text contrast a meaningful graphic needs. A border-colour empty star (1.1:1) made the fifth star of a 4.5 vanish and left the row unable to state its own scale |
| Size | `sm` 11px for a product card, `md` 15px for a product page. `width="1em"` on the svg keeps the two in one rule |
| Text in the row | `role="img"` with a caller-supplied label, e.g. **"Rated 4.5 out of 5"**. The stars alone are never announced, and the half star survives a greyscale render because the shapes differ |
| Where on a card | The **pack-size row**, right-aligned: `pack` truncates, the stars keep their width. Sharing a reserved line is what lets a rating appear without moving the price baseline - a rated card and an unrated one in the same row still line up |
| Where on a product page | Directly under the `h1`, above the price: stars, the figure in the display face, then "out of 5" once. Never a review count beside the stars, never "customers rated this" |
| Default | **Four out of five** (owner direction, 2026-11-11): every product carries `product.rating_halves` and the column defaults to 8 halves, so a product the owner never rated still draws four filled stars and one empty. There is no "no stars" state in the database; the views keep a null guard only for the captured fixture, which must not have a rating invented for it |

**The review block** is a column of panels under the product page's detail section: stars at the head
with **Verified buyer**, the customer's words (`white-space: pre-line`, so their paragraph breaks
survive), the photograph at 160px and 320w, and one quiet date line. The customer's own review is shown
first whatever its state, with the state named (Awaiting approval / Published / Not published). The form
is offered only to a buyer and is a plain `multipart/form-data` POST - no JavaScript is required to
submit it.

**The rating input is five real radios.** They sit in reverse DOM order inside a `row-reverse` flex row,
so `input:checked ~ label` fills the chosen star and every star to its left, in CSS, with arrow-key
support and a screen-reader label per star ("4 out of 5 stars"). The stars are drawn, the words are in
the label. The empty tone is the same 3.09:1 grey as the drawn row, because an unrated star that cannot
be seen cannot be clicked.

**A review photograph renders with `alt=""`.** The customer supplied no description, and the review's
words are what a screen reader should hear rather than an invented caption.

## Admin surface (Phase 18, redesigned 2026-11-07)

The owner panel is the same design system in a different mode: **Operate**, not Persuade. The
storefront earns attention; the panel removes obstacles from a task the owner repeats every day.

**Direction C, "soft counter" (2026-11-07).** The panel was rebuilt on a new visual system chosen from
four rendered directions on the `experiment/qbpanel-redesign-v2` branch. Its world is the shop seen from
behind the counter: a **white rail** with a lavender active pill, a **lavender-tinted canvas**, a
**paper-white card** at 20px with one soft shadow, and the storefront's own lavender and blush spent
only where they carry meaning - the current destination, the queue that waits on a person, and the
filled primary control. The owner's two adjustments were kept: the phone bottom bar is unchanged
(lavender field, ink labels, 2px active rule), and the palette stays the storefront's.

The phone is the primary device, and its navigation is a **bottom tab bar** at the bottom of the
screen, not a drawer. No route, permission, form field, mutation or state machine changed in the
redesign; the class names in `admin.module.css` were kept so every component kept working.

### Tokens added

| Token | Value | Role |
| --- | --- | --- |
| `--admin-canvas` | `#F7F4FF` | Workspace canvas: the storefront's lavender, one step quieter. |
| `--admin-surface` | `#FFFFFF` | Cards, panels and records. |
| `--admin-surface-soft` | `#FBF9FF` | Hover, decided rows, quiet fills. |
| `--admin-line` | `#ECE6F7` | Hairlines inside and around a card. |
| `--admin-line-strong` | `#D9CFF0` | Input borders and disclosure outlines. |
| `--admin-ink` | `#201A29` | Text. |
| `--admin-muted` | `#6A6172` | Secondary text. |
| `--admin-subtle` | `#79718A` | Metadata and hints. |
| `--admin-lavender` | `#C8B6FF` | The active rail pill, the queue hero, avatars. |
| `--admin-lavender-soft` | `#EFE9FF` | Icon plates, filter tracks, quiet fills. |
| `--admin-lavender-deep` | `#8155EF` | Links and the one accent on a white card. |
| `--admin-pink` | `#F6B3CC` | The queue count badge only. |
| `--admin-radius-card` | `20px` | Every card and panel. |
| `--admin-radius-control` | `12px` | Buttons, inputs, selects, disclosures. |
| `--admin-shadow-card` | contact + lavender ambient | The one card shadow. |
| `--admin-shadow-pop` | deeper pair | Popovers, dialogs, the More sheet. |
| `--color-admin-sidebar` | `#FFFFFF` | Navigation rail: white, so lavender is spent on state. |
| `--color-admin-sidebar-ink` | `#201A29` | Rail text. |
| `--color-admin-sidebar-muted` | `#6A6172` | Inactive rail labels. |
| `--color-admin-sidebar-border` | `#ECE6F7` | Rail edge. |
| `--admin-sidebar-width` | `16rem` | Desktop rail width; below 1024px the rail is replaced by the bottom bar. |
| `--admin-topbar-height` | `3.75rem` | Top bar, including the breadcrumb and account menu. |
| `--admin-content-width` | `78rem` | Workspace cap. Narrower than the storefront container because a worklist is read in a column. |
| `--admin-bottom-nav-height` | `4rem` | Phone tab bar, before the device safe-area inset is added. |
| `--ease-out-ui` | `cubic-bezier(0.23, 1, 0.32, 1)` | State and entrance motion. |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | The More sheet's slide-up only. |

No brand colour is used for status. Pending/approved/cancelled/flagged states use the semantic
`--color-warning`, `--color-success`, `--color-danger` pairs, and every pill also carries text and a
dot, so colour is never the only signal.

### Control scale (Phase 27)

Two heights, from `admin.module.css`:

| Token | Value | Applies to |
| --- | --- | --- |
| `--admin-control` | 40px | Buttons, inputs, selects, filter tabs, icon buttons, the account pill, the sheet close control |
| `--admin-control-sm` | 34px | Small secondary buttons, switches, the note disclosure summary - dense-row controls only |

The Phase 24 audit measured 32/34/36/40/51px controls, including an approve (40px) and reject (34px)
pair in one decision, and a search field (40px) beside its own 34px submit button. Three rules now
hold the scale together:

1. **A destructive trigger is not smaller than the action beside it.** `ConfirmSubmit` defaults to the
   standard height; the only reason to pass `small` is a dense list row.
2. **Controls that share a row share a height.** A small button inside `.toolbar` takes the standard
   height, and the filter tabs do too, so the search field and everything beside it read as one row.
3. **Touch widths get the larger target.** Below 720px the small variant grows to 40px, because the
   owner approves orders from a phone and 34px is below the project's own touch guidance.

`scripts/verify-admin.ts` sweeps the rendered buttons, inputs and selects on the overview, COD queue,
catalog and delivery settings, and fails if any control is not 34 or 40px, if the accept/reject pair
disagree, or if the required audit note is collapsed or labelled optional. **Since Phase 30** the sweep
also covers all five list routes and asserts exactly one toolbar per page - a second toolbar on a list is
how a page grows a second, conflicting set of filter conventions.

### Shell and page anatomy

- **Rail (desktop):** white, brand, then permission-filtered groups - Overview, Commerce (COD orders,
  products, categories, brands, promo codes), Customers, Settings (delivery charges, announcement,
  support links, homepage hero, offer popup, integrations, other settings), System (owner accounts,
  audit trail) - then a storefront link. The active item is a **lavender pill with ink text**;
  `aria-current` carries the same fact. No border strip is used as a marker.
- **Top bar:** a breadcrumb (Admin / current page) and the account menu (name, email, role, sign out).
  Below 1024px the breadcrumb gives way to the current section name and the brand mark; there is **no
  hamburger and no drawer**.
- **Bottom bar (phone):** four ranked destinations - Overview, COD orders, Products, All orders - plus
  **More**, fixed above the safe-area inset. It keeps the storefront's lavender field and ink labels
  (owner instruction, 2026-11-07): labels are 11px under 22px icons, each tab is a 64px touch target,
  and the current tab carries `aria-current`, the action-purple label and a 2px indicator.
- **More sheet:** every remaining destination grouped, the signed-in account, sign out and the
  storefront link. It is a modal surface: focus moves to close, Tab is trapped, Escape closes, body
  scroll locks, and focus returns to the More tab.
- **Overview:** a greeting instead of an eyebrow; the COD queue as a full-width **lavender hero card**
  with a blush count badge and the oldest wait in one sentence; then five white KPI cards, the revenue
  and status charts, and the closing panels. On a phone the order is queue, figures, money, catalog.
  The dashboard stops at three queue cards; the full queue is one tap away.
- **Order cards:** reference and age on the top line, name with a 40px `tel:` chip, address, recorded
  lines and totals, then a full-width decision footer with the note and Accept/Reject on one line. The
  card is a white 18px surface with one soft shadow; age is carried by its own pill.
- **Record pages:** each section of an order or customer detail owns one card, and a second question
  inside the same card starts a new band rather than running on. The action band still precedes the
  money facts.

### List anatomy (Phase 30)

Every admin list is built from the same four parts, in the same order, so the panel reads as one product
instead of six screens that happen to share a rail:

1. **Page header** - `h1`, one sentence, the primary action. No eyebrow.
2. **Toolbar** - filter tabs, then search, then the date range (only where a date exists to filter on).
   One per page; `data-admin-toolbar` marks it so the verification can count them.
3. **The list** - a record list (or a table where five short columns beat five stacked rows). Rows carry
   a primary line, a secondary line of metadata, a status pill and the row's actions.
4. **Footer** - `Pagination`: the count, the page-size control and the pager. **This is the only count
   on the page.** A total repeated in the header and the toolbar is how a screen ends up showing three
   different numbers for the same list.

**Search on the three catalog lists is live and fuzzy (owner direction, 2026-11-12).** Products,
categories and brands narrow 300ms after typing stops, through the same `src/lib/fuzzy.ts` matcher the
storefront uses, so a misspelt word still finds the row. It is a `replace` on the URL, so the address
still states what is shown; the submit button and the plain `GET` form stay for Enter and no-JavaScript.
An order list is read once rather than scanned, so it keeps the explicit submit.

**The product list is newest first.** `/qbpanel/catalog` opens on `created_at` descending, not on an
alphabetical ruler, so the row the owner just added is the one at the top. The category list keeps a
child beside its parent and the brand list stays alphabetical: those two lists are reference indexes,
and where a row sits in them should not move because the owner typed in the search field.

**Filter tabs wrap rather than overflow.** Eight status labels are roughly 700px of text; without
wrapping they push the search field and the date row off the edge at phone widths, which is a control an
owner cannot reach. Below 720px the toolbar stacks - tabs full width, search and date range on their own
rows - and every control keeps the standard 40px height.

**Row money cells stack.** A total with a delivery sub-line is a two-line cell; at phone width it starts
its own line under the status and aligns start, because right-aligning it inside a row that has already
wrapped reads as clipped.

### The editor pattern (Phase 35)

A create/edit screen is its own route, and it is built from one shape:

| Part | Contract |
| --- | --- |
| Page header | `h1`, one sentence - from `PageHeader`, the same as every other admin page; no eyebrow |
| Sticky action bar | the readiness summary on the left, Cancel and Save on the right. **The only action bar on the page** - a second one at the bottom is the same content twice and overlays the form |
| Two columns | copy and media left, commercial facts right. Below 1100px they stack, and the **preview comes first** |
| Section cards | one per task (Media, General information, Pricing, Organisation, Publication), each with a one-line explanation. **Media leads the wide column** (owner direction, 2026-11-10): the photograph is picked before the copy is written |
| Live preview | shows only what was typed. An empty field renders as "No price yet", never a placeholder value |
| Required summary | names the empty required fields in text. Never an asterisk convention alone |
| Validation | `noValidate` on the form; the submit handler states the missing set, sets `aria-invalid`, and focuses the first offender |

Three rules behind it:

1. **The preview never invents.** No placeholder price, no "New" badge, no stock figure. A saving is
   derived from the two typed amounts by the same helpers the storefront uses, so it cannot claim a
   discount the storefront would not show.
2. **Two toggles get one sentence.** Publication and availability are independent and both gate the
   storefront, so the form states the combined outcome ("live but not orderable") rather than making the
   owner reason about them.
3. **Reordering is buttons, not drag alone.** A drag-only control is unusable with a keyboard and on the
   phone the owner works from. Order and primary image stay separate facts.

### The settings pattern (delivery charges, announcement bar)

A settings screen is read **across**, not down: the owner compares three charges, or checks one line
against the storefront. So a setting is a declared row rather than a card per value.

| Part | Contract |
| --- | --- |
| Row | identity (name + state), value, save, and an optional destructive action, on **one** grid template |
| Tracks | measured, never content-sized - `minmax(0, 1fr)` identity, `7.5rem` value, `7.5rem` save, `6.5rem` remove |
| Alignment | `align-items: end`. The value field and the button that saves it end on the same line; centring a 40px button against a label-plus-input stack is what left Save floating above its own field |
| Equal rows | the remove slot is rendered even when empty, so a row without a destructive action keeps the same width as one that has it |
| State | a state that differs from the plain case is a pill (`Own charge`, `Checkout blocked`); the plain case is one muted sentence (`Using the default of Tk 120`) |
| Breakpoints | ≤900px the identity takes its own line and the value keeps its measured action track; ≤560px every cell stacks full width |

Two rules behind it:

1. **A preview is the real component, not a redrawing.** The announcement screen renders
   `AnnouncementBar` with the same composition the storefront layout uses (the locked notice first, the
   owner's line beneath it only when it is saved, switched on and non-empty). A hand-built copy would
   drift and quietly promise a bar the storefront does not render.
2. **The row states what a customer pays; the prose does not.** "Using the default of Tk 120" is the
   fact the owner is looking for, so it sits on the row instead of being inferable from two paragraphs.

`scripts/verify-admin.ts` asserts that every control on these screens stays on the 40px scale, and that
the announcement preview tracks what is typed and what the switch says - typing updates the count and
stays out of the preview while the switch is off, switching it on shows the owner's line under the fixed
notice, and switching it off removes it again. The two-column split and the row alignment were measured
in Chromium at 1440px, 900px, 390px, 360px and 320px while the pattern was built; they are not asserted
on every run.

### The order detail (operational record)

An order detail is a **record you act on**, not a profile you read. Its shape follows that:

| Part | Contract |
| --- | --- |
| Page header | the order reference, when it was placed, and the way back to the list it came from |
| Action band | the **next legal step**, first under the header - title, one-line reason, the order total, and the forms |
| Money facts | the four amounts, separate as always; read as context for the action, never collapsed |
| The record | items, delivery contact, events and audit, with return inspection beside the returned line |

Three rules behind it:

1. **The action comes before the evidence.** The owner opens an order to decide or advance it; scrolling
   past the items, the history and the audit to reach the button admitted the wrong priority.
2. **A step exists only when the state allows it.** The band renders from the transitions that will
   actually render, never from the permission list - a settled order shows no band, rather than an empty
   "Next step" panel promising work that does not exist.
3. **The total travels with the decision.** Accepting a COD order without its amount in view is a decision
   made blind, so the band carries the same stored order total the record shows below - not a second
   calculation.

Actions wrap into columns at wide widths; the payment form spans the row because it also carries the
optional additional-cost entry. Below 720px every action is full width. Returns keep their own inspect
controls in the record, because inspecting one line belongs beside that line.

`scripts/verify-admin.ts` asserts the band precedes the money facts on a pending order and is absent on a
settled one.

### The dispatch slip (Phase 52)

`/qbpanel/orders/[orderNumber]/slip` is the paper that travels with a COD parcel. It is **a document, not a
screen**: it lives outside the `(app)` route group, so the rail, the tab bar and the page chrome are not
part of the markup and nothing has to be hidden with print CSS for the paper to be clean. The order
detail's **Print slip** control opens it in a new tab, and the slip's own button prints on click; nothing
prints on load.

| Part | Contract |
| --- | --- |
| Header | the shop's name and "Dispatch slip" - no logo, no promotion |
| Facts | reference in tabular mono, when it was placed (Dhaka time), and the stored order status |
| Deliver to | name, phone, the composed address with the delivery area, and the customer's note when one exists |
| Lines | item, variant, quantity, unit price, line amount - read from the order's frozen snapshot |
| Totals | subtotal, discount only when the frozen amounts imply one, delivery, and **Amount to collect** |

Four rules:

1. **Presentation only.** The page reads one order and writes nothing: no state change, no event, no
   audit row. It prints no internal id, no customer email or account state, and no payment or courier
   cost - a slip states what to hand over and what to collect.
2. **Two paper sizes, one stylesheet.** `@page { margin: 8mm }` leaves ~194mm on A4 and ~64mm on an 80mm
   roll. Under `@media print and (max-width: 30rem)` the **unit-price column is dropped** (it is the one
   a courier does not need), the column headers lose their tracking and shrink, and the totals run full
   width, so quantity and amount still fit on the roll without a second document.
3. **Screen-only chrome.** The controls and the gap note sit in one wrapper hidden at print time; the
   sheet keeps its card frame on screen and none of it on paper.
4. **No invented shop block.** Settings holds no shop phone or address, so the slip carries none; the
   screen states that gap instead of filling it with a placeholder.

`scripts/verify-admin.ts` asserts the slip's content over HTTP, that an anonymous request is sent to
sign-in and a missing order is 404, that `window.print` is never called on load and is called on click,
that the screen wrapper and price column behave as above at A4 and 80mm widths, and that Chromium renders
the page to **one A4 page** and a short 80mm roll.

### The help pages: contact and policy (Phase 51)

`/contact` and `/policies/[policy]` (`delivery`, `returns`, `privacy`, `terms`) are the shop's own
answers, not a support widget. They read one `store_setting` group and render **the owner's facts and
words**; the panel that edits them is **Settings -> Contact and policies**.

| Rule | Why |
| --- | --- |
| A blank field publishes nothing | The page states the gap ("has not published...") instead of a placeholder number or hours |
| Policy text is plain text | `<` and `>` are refused at save time; the page renders paragraphs, never markup |
| The phone is a dialable number or a refusal | It becomes a `tel:` target, so the format rule is mechanical (6-15 digits plus `+ - ( )` and spaces) |
| The footer's Help column is derived | Contact always; a policy page only once the owner has written it, so no link promises an empty page |
| One reading column, 68ch | These are pages to read, not a catalogue to scan |

The copy that used to end in "contact the store" now renders `ContactLink` (`/contact`) at checkout, in
the account recovery copy and on the order receipt, which is what makes the promise resolve. Those
strings keep their fact and drop the instruction, so the link is the instruction.

`scripts/verify-admin.ts` writes the facts over HTTP, refuses an undialable phone and markup without
changing anything, reads the audit record, and renders `/contact`, one written policy page and one
unwritten one at 1440 and 390 - including the footer's population rule.

### Components

`AdminShell` (rail, bottom tab bar, More sheet, account menu, skip link), `PageHeader`, `Notice` (one polite/alert region
per page), `SubmitButton` (pending state from `useFormStatus`), `ConfirmSubmit` (reason-capable dialog
with focus trap, Escape and focus restoration), `StatusPill`, `EmptyState`, `AvailabilitySwitch`,
`CodOrderCard`, and the Phase 30 list primitives: `ListToolbar`, `ListSearch`, `FilterTabs`,
`DateRangeFilter`, `ActiveFilters`, `Pagination`. All are small local components under
`src/app/(admin)/qbpanel/_ui`; styling stays in `admin.module.css` on the tokens above, and the pure query
helpers live in `src/lib/qbpanel-query.ts` so they are unit-testable without a cluster.

### Motion

Only state change is animated: button press (`scale(0.97)`, 120ms), the More sheet's slide-up
(220ms, drawer curve), dialog and menu entrance (140-160ms, `--ease-out-ui`, from `scale(0.98)` plus
opacity), switch knob (160ms). Lists, tables and worklist rows never animate in - they are read many
times a day. The global `prefers-reduced-motion` rule collapses every duration, and no animation
library was added.

### Responsive rules

- **1024px:** the rail is removed and the fixed bottom tab bar becomes the navigation; content reserves
  the bar's height plus the safe-area inset. The breadcrumb yields to the section name.
- **720px:** order cards stack (the decision footer is full width), record rows move their side content
  under the title, the overview becomes one column, and the profile/order detail grid becomes one column.
- **480px:** the account name hides (avatar remains); page actions share the full width.

Verified: no horizontal overflow on all six admin routes at 360px, and the bottom bar, the More sheet
(modal focus, Escape, focus restoration) and the confirmation dialog run in Chromium in
`npm run verify:admin`. **Not verified:** real iOS Safari, Android Chrome, the iOS home-indicator safe
area on a physical device, 200% zoom and screen-reader output.

### Deliberate omission

There is no route-level `loading.tsx`. An App Router loading boundary streams the shell before a page
guard runs, which turns a refused admin page from a 307 into a 200 with a redirect script - the refusal
is still enforced, but the HTTP contract `verify:admin` asserts becomes weaker. Pending states live on
the actions instead. If a loading surface is added later, it must be placed where it cannot pre-empt an
authorisation refusal.

### Figures and charts (Phase 38)

Three pieces, one vocabulary, and **no chart library**:

- **KPI band** - `.kpiGrid` of `_ui/MetricCard` cards. One vertical reading column owns the label, the
  number in the display face and the note; a tinted icon plate sits in its own left column. The label is
  an 11px uppercase micro-label that reserves two lines, so every number in a row starts on the same
  line even when one label wraps. The number is tinted by the card's tone; the tone also supplies a 3px
  top rule and a 5% surface wash. Tone groups figures, it does not report status - `warning` is reserved
  for work waiting on the owner. The dashboard band is five columns at desktop, three from 721-1199px
  and two on a phone (the odd fifth tile spans the phone row); analytics is **three columns above 720px
  and two on a phone**, so its six figures read as two rows of three rather than one row of six. Counts
  use `Intl.NumberFormat`; money uses `price()`. A figure
  that cannot be computed reads an em dash and its note says why ("No paid order yet"); it never reads
  zero.
- **`.chartGrid`** - the plot at roughly two-thirds width beside a ring at one-third, collapsing to one
  column below 1080px.
- **`_ui/charts.tsx`** - `AreaChart` and `DonutChart`. Both are stateless, so they render on the server.

**The chart rules that are not negotiable:**

1. The plot is a fixed coordinate space (`viewBox 0 0 640 180`) stretched to its container, with
   `vector-effect="non-scaling-stroke"` so the line stays 2px rather than fattening on a phone. Do not
   draw markers inside a stretched SVG - a circle becomes an ellipse.
2. **Axis text is HTML beside the plot, never SVG text.** Scaled text is either huge or unreadable.
3. The SVG is `aria-hidden` and the same values are emitted as a screen-reader table.
4. **A window with no data draws a compact empty state, not a line at zero.** A dashed sunken panel, a small chart glyph and one sentence replace the plot; four axis labels that all read "0"
   look like a broken chart.
5. Axis money is compact but proportional: `1.7k` / `3.3k` / `5k`, one decimal between 1k and 10k.
6. Tones come from the palette tokens (action, success, warning, danger, neutral), never raw hex, and a
   ring always ships a legend with the value and the share - colour is never the only signal.

**Recent orders is a list, not a table.** Five columns at 390px shrink every cell to a word fragment, so
the dashboard states the same facts in two lines per order (`.recentList`), which is legible at 320px and
still reads as a row on a desktop.

**Two-column pages finish together.** A page with a tall card in the right column puts a second card in
the left column rather than leaving a long empty margin (`.duoGrid`, `.splitGrid`, `.stack`).

## Customer account dashboard (2026-11-10)

The customer's own surface is an **app screen**, not a storefront page. It was dealt as one
(achromatic-ledger, shell redrawn to the labelled open plane because the owner asked for a sidebar)
and the rules below are that deal, so a later change does not quietly put the old card grid back.

**Shell.** `AccountFrame` draws one 240px labelled sidebar on the page ground with a single hairline to
its right, and the canvas beside it at a 48px gap. The sidebar names the **person**, not the shop: the
storefront header immediately above already carries the mark and the wordmark, and a second logo in the
sidebar was the duplication the first build was rejected for. Nav rows are 32px on a 34px pitch, the
active destination is a **neutral grey pill** with the label unchanged, and the sign-out sits at the
foot. Below 900px the sidebar folds to a strip above the canvas; the sign-out joins the strip, so a
phone never has to open a screen to leave.

**The phone is its own composition (2026-11-10, second pass).** Folding the sidebar into a wrapping
strip of bordered chips was the first attempt and it read as a broken toolbar: four chips, two rows,
one of them a sign-out that looked like a destination. The folded state is now:

- **One segmented track**, three equal cells on `--color-border` with the current screen on white at 500
  weight - 40px tall, so the whole row is a thumb target and nothing wraps at 390px. It is capped at
  440px from 480px up: stretched across a 768px tablet a segmented control reads as a progress bar.
- **One identity row** under it: who is signed in, and a plain **Sign out** on the right, both inside a
  40px row. The shop's contact page leaves the phone navigation - the footer already carries it - and
  stays a desktop sidebar item.
- **Destination names are one word per width.** The third screen is **Security** in the sidebar and in
  the track; its `h1` is the same word, and the two sections under it name the password and the address.
- **Everything a thumb lands on is 40px**: the segments, the sign-out, the panel links and an order
  number. A 24px text link inside a 40px row is still a 24px target.
- **The figures keep their alignment**: each cell is `auto 1fr` and the value sits on the cell floor, so
  "Due on delivery" wrapping to two lines no longer pushed its figure below the other two. The notes
  under the figures are hidden at this width; the labels already say what each figure is.
- **The order's own block** puts the amount under the order line rather than beside it (a 16-character
  number and a 26px figure never shared a 358px row cleanly), and the progress track turns from five
  marks across into five stacked rows.
- **The finding is stated once.** The line under the title used to repeat the order number the panel
  immediately below already names; on a phone that spent the first screen on the same characters twice.

**Colour budget.** The chrome holds no colour at all — titles, nav, links and buttons are ink and two
greys. The brand lavender appears twice and only for meaning: `--brand-primary-deep` on the **current
mark** of an order's progress track, and `--color-action-soft` as the tint of the selected filter card.
The account's buttons are **ink, not the brand field**: the style this surface was dealt spends the hue
on data, and using the lavender for the chrome as well left nothing for the track to say. This is the
one place in the storefront where a filled button is not `--color-button`; a change must keep the reason.

**Shape.** Two radii, no more: 10px for a panel, 6px for a control or a chip. Panels separate by one
tone step (page ground → white) and never by a shadow. Figures are tabular so money digits align.

**The progress track** is the surface's signature element, and it is derived, never stored twice.
`orderProgress` (`src/features/account/dashboard/progress.ts`) maps the order's own `status` and
`cod_state` onto five marks — placed, confirmed, dispatched, delivered, cash received — and marks the
furthest one reached as current. Two honest rules live there: a COD order awaiting the shop's call has
**not** reached "confirmed" however the row reads, and a cancelled or returned order draws **no track**,
because it has no next step to promise. Below 720px the five marks become five stacked rows; five labels
across 358px collided ("ConfirmedDispatchedDelivered").

**Figures.** The three cells above the panels — orders placed, cash due, money recorded as received —
are summed from the same rows the page lists (`dueOnDeliveryMinor`, `recordedPaidMinor`), so a cell and
the list behind it cannot disagree. A zero is set in grey, not hidden.

**Screens and their one question.** `/account` — where is my order and what do I owe; `/account/orders` —
what did I order and what is still coming; `/account/security` — is this account still only mine. Every
account-security notice returns to `/account/security`, beside the form that caused it.

**Verified 2026-11-10:** the app-screen inspector at 1440, 768 and 390 reports **0 FAIL** on all three
screens. Its one remaining warning is `no-data-hue`, which is accepted: no chart is drawn, and the hue
sits on the track's current mark. Two rules were allowed page-wide (`palette-purple`, `edge-text`) because
both come from the shop's existing header icon buttons and the phone tab bar's "Account" label — the
untouched `/products` page reports the identical pair. **Not verified:** real iOS Safari, Android Chrome,
screen readers, and 200% zoom.

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
Product cards are ~173px on a phone, ~209px at the 1200px step, ~252px at the
1440px container cap and still ~252px at 1920px - bounded by the cap rather than
inflated by the extra width.

**`auto-fill` was tried and rejected.** Bounding card width with
`repeat(auto-fill, minmax(220px, 1fr))` did keep cards ~224px, but the row a
selection fills then depends on the viewport instead of on the design: a five-
or six-column track left trailing holes, and at 1920px an eight-item row filled
only four of six columns. Explicit column counts were kept and the container cap
does the work.

## Responsive behaviour

Breakpoints: 600px (footer 3 columns, auth password pair side by side), 720px (category grid, hero band padding, the full-width grid becomes three columns), 880px (hero splits, category strip becomes five columns, catalog sidebar, PDP and cart two columns), 1024px (header navigation replaces the bottom bar), 1200px (the full-width grid becomes five columns, header is one row).

**The full-width grid is two columns on a phone, three from 720px and five from 1200px** (owner
decision, 2026-10-23: three across read far too large). Five is the row every fixed homepage section
publishes, and the reason there is **no four-column step** is the same arithmetic as before, inverted:
a five-card section in a four-column grid ends on one lonely card and three empty tracks, while a fifth
card at 1024px would be ~175px - under the 200px floor `verify:browser` asserts. Between 1024 and
1199px a five-card section therefore reads 3 + 2, an ordinary grid rather than a hole. The catalog
listing keeps its own denser scale (four columns from 1280px) because it has a filter column and is read
row by row.

The featured row is simply the standard grid: 2 columns on a phone, 3 from 720px, 5 from 1200px, one
product per department, and no controls of its own.

**Homepage order (owner decision, 2026-10-23): hero, categories, featured, offers, recently added,
more to explore.** The recommendation leads because it is the strongest thing the shop can say; the
offer row follows a choice rather than preceding it; recency sits third; and the browse row closes the
page with its way out.

The three fixed sections publish five products - one complete row on a desktop - and on a phone the
two-column grid lets the final card take the row rather than stranding it. **"More to explore" is the
one browse row:** it leads with the shop's collection and continues into every product the rows above
did not show, up to ten (two desktop rows), and ends with a centred "View more products" button into
the catalog. It is the only section allowed to finish on a partial row; it is never padded with a
repeat to fill one.

**The category index is one department per row on a phone.** Two cards per row left ~139px of inner
width for an icon, a name, a two-line blurb and "12 products", and the count printed over the blurb -
the broken box the owner reported. Two columns return at 720px; the name and count share one line at
every width, so the count can only ever take the space the name leaves.

### Why the desktop header starts at 1024px

The full desktop header - brand, inline navigation, search and action buttons -
needs roughly 1000px of content width to fit on one row. Measured: at 880px it
required ~1003px but the container offered only 858px, so the action group
wrapped and the header grew to 104px.

At **1024px** the header's inline navigation appears and the phone's bottom tab bar
disappears, so exactly one navigation model is live at any width (ADR 0020). The
breakpoint was measured with the widest navigation the bilingual interface ever
produced (441.9px Bangla, 446.7px English), so it still holds now that the
interface is English only.

From 1024px the row is a `1fr auto 1fr` grid: brand, navigation, actions. The
equal side columns are what centre the links **in the viewport** - a flex row with
a flexible search field pushed them left and made the bar read as brand plus
leftovers. Between 1024 and 1199px there is no room for a typeable field beside
the centred links, so search becomes a compact link to the catalog's own search
rather than an input squeezed to an unusable width; the real field returns at
1200px, where the header is a single 65px row.

### Mobile-first decisions

- **The homepage category section is hidden below 720px** (owner decision, 2026-10-23; supersedes the ADR 0020 reading above). It was visible at every width because the removed drawer had been the phone's only category list - but the phone now has **two** paths to the same index, the tab bar's Categories tab and the hero's "Browse categories" button, so the five-card strip was a third one and cost most of a screen between the headline and the first product. From 720px it returns: the drawer is gone there too, but a tablet has the width to show a department strip instead of hiding it.
- **The phone hero hides its three photographs.** They are a teaser strip for a wide screen; at 390px they pushed the first product row below the second screen. Both omissions are CSS-only, so the markup, the picture sources and the desktop composition stay one source of truth.
- **The hero carries no tinted band.** A pastel panel behind the first screen was tried and removed: it read as a promotion rather than as the shop, and it was the only place in the storefront where a section had its own background. Every section sits on the page canvas.
- **The header is not sticky on a phone.** Two rows of chrome pinned to the top of a 390px screen cost ~116px of a ~700px viewport, and the bottom bar already carries navigation, so the header scrolling away is what buys the product grid its first row back.
- **The hero's two buttons are equal-width on a phone.** Two actions of different widths stacked in one column look accidental.
- **The catalog's filter panel is a disclosure on a phone, closed on arrival.** Measured before the change: the category and brand chips filled the entire first screen at 390px, so the first product began below the fold on a page whose whole purpose is to show products. The toggle states how many filters are active, and the active ones are named in the toolbar, so a closed panel hides nothing.
- **Header height, hero padding and the display type size all step up only where the measure allows it**, rather than starting large and being shrunk for mobile.

### Overflow discipline

Two traps are worth remembering because both caused real page overflow:

1. **Nested grids default to `min-width: auto`.** A grid item cannot be narrower than its content's minimum unless `min-width: 0` is set. Without it, a nested grid reports its whole column set as its minimum width and pushes the page sideways.
2. **`overflow-x: auto` clips visually but does not stop the content contributing to an ancestor's scroll width.** A horizontal row needs `contain: layout paint` before it stops widening the page. Containment fixes the cause; `overflow: hidden` on the parent would only hide it.

Both were found in the old scrolling featured shelf, which no longer exists: the featured row is a static five-card grid, so the homepage has no horizontal row at all. Keep both rules for any future one.

The Phase 3 checkpoint recorded no horizontal overflow on `/`, `/products`, `/cart`, `/checkout`, a product page and a category page at 320px. Phase 5 extended browser coverage to 320-1920px and recorded 64/64 passing checks. These are historical suite results; see `docs/project-status.md` for current audit verification boundaries.

Touch targets: primary controls at least 40px; breadcrumb links raised to a 24px minimum (WCAG 2.5.8).


## Refinement pass - phone first (2026-10-29)

This pass fixed measured defects rather than restyling. Each item was found by rendering the real catalog
at 390, 768 and 1440 and reading geometry, not by eye alone.

### One control type size, and no page zoom on a phone

- **`--text-control`** is the form-control size: **15px on a desktop, 16px below 720px**. The second value
  is a correctness rule, not taste - iOS Safari magnifies the whole page when a control under 16px is
  focused, so a checkout field used to leave the customer looking at a zoomed page they had to pinch back.
  Every control (header search, catalog search and sort, cart stepper, checkout fields, promo field, admin
  inputs, selects and textareas) reads the token.
- **The admin's small control grows on a phone.** `--admin-control-sm` is 34px on a desktop and **40px below
  720px**. AGENTS.md and this document already stated that rule; it had never been implemented, so a 34px
  button sat beside a 40px one on every phone list. Measured after the fix: phone admin pages carry **only**
  40px controls (plus the 64px tab bar).
- **Page zoom is disabled** (`maximum-scale=1, user-scalable=no`) by owner decision. A phone is the main way
  the owner runs the shop, and a page that magnifies on a stray double tap or on focusing a field reads as
  broken. **The cost is recorded rather than hidden:** pinch-to-zoom is an accessibility aid, and removing it
  trades that away for a stable surface. Every control is sized for a thumb, body text is 15-16px, and
  layouts reflow instead of relying on zoom. `touch-action: manipulation` also removes the 300ms double-tap
  zoom, and `text-size-adjust: 100%` stops iOS inflating text in landscape. Reversing the decision is two
  lines in `src/app/layout.tsx`.

### Alignment is a rule, not a coincidence

- **A product card's price sits on one baseline across a row.** The card reserves its brand row, clamps the
  title to two lines and reserves its pack row, so the price starts at the same offset whether a product has
  a brand, a long imported name or a pack size. The price block is **no longer bottom-anchored**: with
  `margin-top: auto` a short card opened a ~90px gap between its title and its price while its neighbour had
  none. Optional saving and availability lines follow naturally; the grid's stretch supplies the equal height.
- **The hero carousel keeps one frame and one edge.** Every banner is the same 16:9 box, so the track has
  one top and one bottom edge and a slide cannot change the page's height as it advances. The old
  32px/12px collage stagger is gone with the collage.
- **The PDP quantity stepper and Add to cart are both 46px.** They were 42px and 46px, top-aligned, which is
  the kind of 4px mismatch that makes a purchase block feel unfinished.
- **The COD card's money column fills the card on a phone.** `justify-items: start` left a 192px totals block
  floating at the left of a 358px card; the Total rule stopped halfway and the figures ended in the middle of
  nowhere. It now stretches and shares one right edge.
- **A card's optional rows are reserved, never filled.** Empty slots use a non-breaking space with
  `aria-hidden`, so no content is invented.
- **One undefined token was painting four hover borders.** `--color-primary` was never defined, so
  `border-color` fell back to `currentColor` and a hovered card drew a dark border instead of the brand
  purple. All four uses now read `--brand-primary`.

### Admin on the device it is actually used on

- **An editor's action bar stays sticky below the top bar.** It went `position: static` below 720px, so after
  filling a long product form the owner had to scroll back to the top to press Save. It now parks at
  `top: var(--admin-topbar-height)`, and `scroll-padding-top` (set on `html` only while an admin shell is
  present) keeps a focused field clear of both sticky rows.
- **A product row drops its slug on a phone.** The slug is a search aid, not an identity; at 390px it wrapped
  to three lines and doubled every row's height. It stays on the desktop list.
- **The audit table keeps its reading width and scrolls inside its wrapper.** On a phone the timestamp used to
  break over three lines beside a two-line actor; the first cell is now `nowrap` and the table has a
  46rem minimum inside `overflow-x: auto`, which is the behaviour the screen already claimed.
- **A capped search field.** Left to grow, the admin search took 830px of a 1440px row, reading as an empty
  band with a stranded button. It caps at 30rem and is full width on a phone.
- **The COD queue link sits at the far end of its heading row**, because the block it lives in now fills the
  panel instead of shrinking to its text.
- **The date range on a phone is two equal halves plus a full-width Apply.** Two native date fields and a
  button on one 390px row squeezed the date until the calendar glyph covered the year.

### Checkout could not fit a phone

A 390px checkout measured **411px** wide with one item in the cart, so every price in the summary was cut at
the right edge. The cause was a grid item's automatic minimum: the promotion field's intrinsic width made the
whole column wider than the viewport. `.layout > *` now has `min-width: 0`, the promotion row is a
`minmax(0, 1fr) auto` grid, and the summary and cards may shrink. Measured after: **390 = 390**, form and
summary 358px, no clipped figure.

### Smaller corrections

- The announcement ticker fades at both ends with a mask instead of slicing a word against the glass.
- The header search placeholder was shortened to "Search products or brands" so it fits the field it is in.
- "1 items" became "1 item" in the cart header and its live-region announcement.
- The cart badge now counts stored quantities without needing product records, so it is correct on every
  route - not only on the two that draw lines.

*Unverified:* real iOS Safari and Android Chrome, and screen-reader output on real assistive technology. 200% zoom reflow is no longer reachable by pinch on a phone because zoom is disabled; text resize and reflow are still expected to hold, and remain unverified on a device.

## Critique pass - the admin rhythm and the thumb (2026-10-29)

A design critique of the phone landing page and the admin panel found the defects were systemic rather than
page-specific, so they were fixed in the shared layer instead of page by page.

**The control scale was only true above 720px.** An input took `16px x 1.6` of line box plus 8px padding, so a
phone money field rendered **42px** directly above a **40px** Save button. Inputs and selects now carry an
explicit `height: var(--admin-control)` and `line-height: 1.25`; a textarea keeps `height: auto`.

**Row actions were not controls.** `Edit` / `Archive` / `View` measured **21px** tall (24px wide) beside a
40px availability switch - the smallest things to hit on a phone, in the worst thumb zone. They now take
`--admin-control-sm` (34px desktop, 40px phone) with horizontal padding, and a panel's "View all" takes 40px
on a phone. Measured after the change on a 390px viewport: **every** visible control on `/qbpanel`,
`/qbpanel/catalog` and `/qbpanel/categories` is 40px (7, 88 and 39 elements).

**Grouping.** The page gap was 32px while a panel's own padding was 24px, so a panel boundary read like a
paragraph break. The gap is **48px** on desktop (32px on a phone), which separates blocks without shrinking
the panel.

**A list filter is a segmented row on a desk and a disclosure on a phone.** Eight status tabs cannot be a
segmented control at 390px. Two attempts were rejected in practice: wrapping them inside the pill put the
second row on a different column and the control read as broken, and a single swiped rail with an edge fade
hid four of the eight statuses behind a gesture nobody could see, never scrolled an active filter into view,
and dimmed the last reachable tab until it looked disabled (the owner's verdict: **hard to use**). Both are
gone.

What ships: above 720px the segmented row, unchanged - a wide screen shows every option at once. At and
below 720px (`FilterTabs` renders both, and only one is ever displayed) the same filter is a **40px
disclosure whose closed summary names the filter in force** ("Filter by status · Returned"), opening into a
vertical list where every status is a 40px row with its count and the chosen one is filled and checked. No
gesture, no clipping, no invisible state, and one row of screen instead of three. The date range filter
shares that column, so a phone toolbar reads as stacked 40px rows.

The rule this settles: **a filter's *options* may live behind a disclosure, provided the closed control
states the value that is applied and every option is one tap away.** A required field, a destructive action
or anything the owner must see before acting still may not be collapsed. The analytics period switch is
three options and stays visible as chips.

The segmented row keeps `min-width: 0` for the same reason as before - a nowrap row must never widen the
page.

**Filters that took a third of the screen.** The date range was two native date inputs plus an Apply button
above every order list: **263px** before the first row. It is now a `Filter by date range` disclosure that
states the applied range in its summary.

**The queue is the front door.** The stylesheet has said so since Phase 38 while the DOM put five KPI tiles
and a chart before it - the calls waiting sat **1.3 screens** down a phone. The queue panel now comes first.
The lone fifth KPI tile spans the phone row instead of leaving a half-width hole.

**Product rows lost their monogram.** It printed the name's first character, so a catalogue whose vendor
names start with digits read `1, 1, 2, 2, 3, 3` down the list; the title takes the space instead, and the
category, brand and slug are separated by a middle dot rather than by air alone.

**Storefront.** Account and cart are 8px apart rather than 4 (two 40px targets in the thumb zone). Section
"View all" links are 40px targets instead of 49x21. The phone hero gives back ~28px so the first product row
starts higher, and the ticker's edge gradients are wider than the gutter so a mid-travel word cannot sit hard
against the glass.

*Verified:* 390px audit across 11 routes - **0 horizontal overflow**, **0 misaligned rows**, no visible
control under 16px; desktop 1440px unchanged apart from the intended rhythm. *Not verified:* real devices,
screen readers, and the phone's own soft keyboard behaviour.


## The guest-ordering switch, and a panel whose boxes touched (2026-10-29)

**Settings -> Other** is the only screen that carries the guest-ordering policy (D12, ADR 0024). Two defects
were reported against it together, and they turned out to be independent.

**The switch could be turned off and never on.** The form posted a hidden `guestOrders=false` **and** a
checkbox named `guestOrders` with `value="true"`. A form's entry list is in document order, and
`FormData.get()` returns the **first** entry, so the hidden field won every submission: the box posted
`true` and the route read `false`. Turning guest ordering off worked, which is what made this quiet - the
panel answered "saved", the switch came back off, and checkout asked the visitor to sign in. The hidden field
is gone (an unticked box posts nothing, and the policy already reads "nothing" as off), and the route now
reads the **whole** list so that any explicit `true` wins. That makes it independent of the markup order
rather than depending on the order never regressing.

Measured after: posted entries `["csrf=...","guestOrders=true"]`, stored `checkout.guest_orders = true`,
the switch checked on reload, and an anonymous 390px visitor with a cart clicking through to checkout landed
on `/checkout` (**not** `/account/login`) with the order form rendered and **Place order** enabled. A guest
order was then created through the same service the route calls (`customerId: null`, two 650 BDT lines plus
the 100 BDT Dhaka charge = **1,400 BDT**) and the transaction was aborted, so the proof left no rows.

**The panel had no gap between its children, and the state readout was a second box.** `.panel` supplies
padding but no vertical rhythm, so the switch row's border, the tinted outcome box and the Save button met
edge to edge. The screen now uses the vocabulary its siblings already use: a `formCard` (which owns the
16px gap), narrowed to 34rem so one switch is not stretched across 1,400px, and the saved policy stated once
as a state token beside the consequence of that state - no border and no background of its own. The readout
describes the **saved** value, not the box's current tick: the draft-versus-saved split the announcement
editor already uses.

Measured at 1440 and 390: switch row -> readout **16px**, readout -> action row **16px**, no element
overflowing its viewport, and the only controls are the 40px Save button plus the 18px box inside a 99px
(1440) / 133px (390) label that is the real target.

*Checked across the group:* `/qbpanel/settings/delivery`, `announcement`, `integrations` and the Telegram
screen report 0 overflow and 0 misaligned rows at both widths. The announcement screen's eight "overflowing"
elements are its ticker track, which is wider than the viewport by design and clipped by its container.

*Unverified:* real iOS Safari and Android Chrome; no rendered-behaviour suite covers the Settings group at
all (`verify:admin` never visited `/qbpanel/settings/other`, and `verify:storefront` has no guest check), so
this defect shipped through both.


**The same defect, mirrored, on the category editor.** That editor posts a hidden `isVisible=false` and a
box with `value="true"` under the same name - a pair that exists because an unticked box posts nothing and
the service reads "nothing" as **visible**. `form.get('isVisible')` therefore returned the hidden `false`
for a **ticked** box too: a category could be hidden and never shown again, and the panel answered
"updated". The route now reads the whole list (an explicit `true` wins; an absent field still lets the
service keep its default). Measured before and after on the exact entries a ticked box sends, inside an
aborted transaction: `["false","true"]` stored `false` before and `true` after. `verify:admin` now hides
and re-shows a category through the real editor, so a regression fails the tick direction specifically -
the direction a list filter cannot notice.


**The page and the route disagreed about "anonymous".** The order route decides that by **resolving** the
session, but the checkout *page* decided it from the presence of the session cookie. A cookie that no longer
resolves - expired, revoked, rotated - therefore sent the visitor to the sign-in page with guest ordering on,
while the same request to the order route would have been treated as a guest: the page refused to draw the
form the route would have accepted. The page now resolves the principal and reads "no principal" as
anonymous, so only the owner's policy can send a visitor to sign in. Measured with guest ordering on: both a
cookie-less request and one carrying a dead `qb_customer_session` value return **200** from `/checkout`
with `action="/api/checkout/order"` in the body; with the policy off, the cookie-less request still
redirects (the existing `verify:admin` check).

**The same missing gap, one screen along.** `/qbpanel/settings/integrations/telegram` had the identical
defect, because it also used `.panel` as a **form** container: the bot card's status row and its note met at
**0px**, and the Add and Save buttons sat flush against the hint text and the input above them. All three
cards now use `formCard`. Measured at 1440 and 390: status row -> note **16px**, field grid -> action row
**16px** in both forms, 0 overflow. The rule this makes explicit: **`panel` is for a box that holds prose or
a list; a form's card is `formCard`, which owns the vertical gap.** (`.panel` deliberately keeps no gap of
its own - it holds panels whose children bring their own spacing.)

**A roster that could only ever grow.** The same screen offered **Pause** on a destination and no way to
remove one, so the smoke-test id registered while the bot was being set up stayed in the fan-out list for
good. *Remove* now sits beside Pause/Resume - both 40px, **8px** apart, because `--space-1` is right between
a link and a button but two real buttons, one of them destructive, need more than a thumb's width of
separation - and it opens a confirmation that names the destination and the chat id it is about to lose.
The deleted row is the only place its chat id lived, so the audit record carries the label, id and active
state as `before`; the id is on the screen before the dialog opens, so it can be registered again. A removal
that finds no row (a second owner, a page open since before the row was removed) answers "already gone" in
the notice strip rather than a 500 or a false success.

*Verified:* the delivered round trip through the real interface and the database - add (`notice=added`, row
active), pause (`is_active = false`), resume (`true`), remove (dialog naming "Verify destination
(987654321)", row gone, one `integration.telegram_recipient_removed` record), an already-gone removal
("already gone", nothing deleted), and the empty state back once the last row goes. *Not verified:* delivery
to a real Telegram account from a freshly registered id (no owner chat id in this environment), and real
iOS/Android touch.

## The phone header, the floating cart and the support rail (2026-11-05)

**Three zones on a phone, and the logo is genuinely centred.** Below 1024px the header is a three-column
grid - the menu control, the brand, the cart - with equal outer tracks, so the logo sits on the screen's
centre line rather than in whatever space the side controls leave. The search row stays beneath it. The
menu opens a **modal drawer**: 44px rows for home, the catalog, the category index, each department, brands,
cart and account; focus moves in, Tab is trapped, Escape closes it, the page behind is locked, focus returns
to the trigger, and it closes on navigation. The bottom tab bar is unchanged and remains the primary
navigation. From 1024px the desktop bar is exactly what it was, and neither the drawer nor the tab bar is
rendered.

**A floating cart box** sits at the right edge, vertically centred at every width - omitted on `/cart` and `/checkout`, where
the page's own summary repeats its two facts and the fixed box covered them - filled with `--brand-primary-deep`
(#8155ef) and carrying white marks (4.6:1). The lighter `--brand-primary` is not used behind white: at
1.81:1 a white icon or label would not be visible, so the control carries the field with ink on it and the
lavender stays a surface for ink. It states the item count always and the
subtotal when every line can be priced; the prices come from `GET /api/cart/prices` (ids from the `qb_cart`
cookie, unit prices from the database) and are multiplied by the browser's quantities for display only -
the order transaction recomputes every line.

**A support rail** sits in the bottom-right corner, clear of the tab bar, with a Facebook and a WhatsApp button, drawn as our own outlined
marks in white on that same `--brand-primary-deep` fill (never the providers' brand colours, never white
on the lighter lavender). Their addresses are the owner's `store_setting`
values, edited at Settings -> Support links: a blank field renders **no button**, and both are validated as
absolute `https` URLs at save time. They open in a new tab with `rel="noopener noreferrer"`.

**Homepage order and headings.** Hero, Shop By Category, Shop By Brand, On Offer, Most Selling, Recently
Added, More To Explore. Every section heading is centred and title-cased, with at most one link into its
full listing - beneath the rail for the product rows, and **as the discovery rails' last circle** for the
categories and brands (owner direction, 2026-11-12). **Most Selling is derived from real `order_item` units**
- cancelled orders excluded, recency given priority - and it is **omitted entirely when the shop has sold
nothing** (owner direction, 2026-11-07), rather than drawing a heading over an empty shelf.

## Storefront discovery (2026-11-02)

The homepage, category index and product page were rebuilt around **pictures, at phone size first**.

**Homepage order.** Hero (image carousel), offers, categories, featured, brands, new arrivals, browse.
The first screen carries the owner's banner carousel (Phase 51, above), so the shop's own artwork is what a
shopper sees first. The former copy-and-three-photographs composition and its phone spotlight row were
removed with it: the hero no longer derives from product recency, and the carousel makes no arrival claim.

**The offer shelf** is a CSS scroll-snap track: 62% card width on a phone (the next card is visibly
cut, which is the affordance), 44% at 480px, 30% at 720px and a quarter of the track from 1024px, where
previous/next controls and slide dots appear. The hero advances every 9 seconds, wrapping at the end (2026-11-05); the controls call
`scrollBy` and the shelf works with them removed. The dots are 8px marks inside 24px pressable areas.

**Category rail.** The homepage draws categories as **five circles on a phone row** (owner direction,
2026-11-05; 62px at 390px, 48px at 320px), five or more from 720px where the circle is fixed at 104px,
and the same component `size="circle"` as the brand rail. The circle is the subject: the photograph
fills it with a centre crop and the name sits beneath. **Since 2026-11-12 the row is a carousel at every
width that publishes twenty circles on a desktop and fifteen on a phone, ending in the "View all" circle
when the shop has more** (see the carousel table above).

**Brand index.** The brand index draws the **same circle** as the category index, with the logo
contained at 92% of an 8%-inset circle; `npm run assets:logos` trims each logo's empty border before
rebuilding its WebP variants, so a padded favicon fills the frame instead of floating in it. The white
surface belongs to the mark; the four pale tints belong to the no-logo monogram.

**Brand rail.** The homepage draws brands in the **same circle** as the categories above them
(owner direction, 2026-11-05): one round tile per brand, the mark inset inside it, the name beneath and
the product count under the name, in the shared `Carousel` (`size="circle"`). The circle frames a logo
rather than cropping one - a mark is rendered with `object-fit: contain` on the circle's own white
surface, because a favicon is drawn to the edges of its square and a circular crop would cut a wordmark
in half. A brand with no logo draws the shared **letter mark** — the first letter in Bricolage Grotesque at 46% of a circle, on one of four pale plates chosen by that letter, so the same letter is the same mark everywhere (`src/components/LetterMark.tsx`). The square-card rail this replaced is
gone rather than kept beside it, so the page has one brand presentation. The brand **index** keeps its
circles, and since 2026-11-05 the **category index draws the same circle**, with the photograph filling
it (`object-fit: cover`, centre crop) instead of sitting inside a square tile.

**Category index.** Square photographs, 2 across on a phone, 3 at 480px, 4 at 720px, 5 at 1024px. Each
tile shows the photograph, the name, a one-line label and the product count as a small chip on the
photograph. A category with no photograph draws the same shared letter mark in its circle.

**Product page.** The photograph is drawn **uncropped, at the file's own shape** (owner direction,
2026-11-12): a landscape upload is landscape, nothing is cut off the sides, and the frame simply follows
the image. `ProductPhoto`'s `uncropped` prop is what selects this, and the `<img>` `width`/`height` come
from the stored pixels (`product_image.width`/`height`, recorded by the upload from its own encoder), so
the box is reserved before the bytes arrive and the page does not shift. The desktop frame, the phone
carousel's slides and the zoom all follow the same rule; the **thumbnail strip** stays a uniform 4:5
crop, because a picker reads as one row of one size. Cards keep their 4:5 `CARD_FRAME` crop - the two
decisions are opposites on purpose. A gallery mixing shapes makes the phone strip as tall as its tallest
slide and centres the shorter one; that is the accepted cost of never cropping. From 880px the media
column is capped at **480px** and is sticky, so the price, the facts and the actions sit beside the
photograph rather than below it. The purchase block is observed with `IntersectionObserver`; a fixed
purchase bar appears only once the gallery has scrolled away **and** the in-page block is off screen, so
the first screen is never covered by a duplicate control. The breadcrumb is one line and may shorten
only its last level.

**Discovery imagery is an asset key, never a URL.** `category.image_key` and `brand.logo_key` hold keys
validated against the server's own inventory; every rendered path comes from `src/lib/images.ts`. The
tiles are generated at the same two widths as product photography (600 and 1050) by
`npm run assets:discovery`, so one route and one allowlist serve all three families.

**Brand marks are verified, not guessed.** A brand's favicon is only used when the brand's own page
names it in `<title>` and the icon is at least 96px; a brand that cannot prove itself keeps
`logo_key = null` and the tile draws its first letter as a monogram. A wrong mark on a right name is worse than no mark.

**The owner can replace a brand mark.** `/qbpanel/catalog/brands` lists the brands with the logo each one
shows, and `/qbpanel/catalog/brands/new` / `/qbpanel/catalog/brands/[brandId]` are the brand editor: name,
slug and mark in one form (`BrandForm`, the same shell as the category editor). The mark is uploaded
from the browser or chosen from the shop's own inventory through the shared `CatalogImageField`; the
write route is `POST /api/qbpanel/catalog/brand`, gated on `catalog.write`, with a `returnTo` allowlisted
to the editor's own shape and the refusal returned to the editor that produced it. Name changes are
audited as `catalog.brand_updated`, a mark as `catalog.brand_image_updated`.


## Visual refinement — 2026-11-05

A craft pass over both surfaces, driven by an owner review of the admin's figures and the phone
chrome. No component, route, permission or business rule changed; the token layer and the presentation
components did.

- **A display face.** Bricolage Grotesque (self-hosted, `public/fonts`, 400-700) joins Inter. It is
  applied to `h1`-`h4` and to money figures (`.kpiValue`, `.statValue`, `.donutValue`, the storefront
  price). Inter stays the text face, and product/customer data stays in Inter/Noto so Bengali still
  falls through correctly.
- **Elevation.** `--shadow-sm`/`--shadow-md` were deepened and a `--shadow-lg` added; panels, KPI
  tiles and the active nav item now use them. The old panels separated from the canvas by a 1.31:1
  hairline alone.
- **Shape.** `--radius-sm|md|lg` moved 4/8/12 -> 6/10/14.
- **Tertiary text.** `--color-ink-subtle` moved `#857e8d` (3.91:1) -> `#79718a` (4.63:1), because it
  is used at 12px for KPI notes, chart axes, legend shares and table hints.
- **Charts.** Distinct categorical hues (`--chart-1`..`--chart-8`) replace the five semantic tones, so
  the order-status ring can no longer render three statuses in one purple. Money ticks are 1-2-2.5-5 x
  10^n instead of thirds of a ceiling; the plot height is fluid; the area is a gradient; points carry
  dots; a pointer gets a crosshair and a value tooltip; the x labels sit under their points; and an
  empty plot states the gap on a ruled baseline instead of inside a dashed placeholder box. Markers
  and the tooltip are HTML, because the plot uses `preserveAspectRatio="none"`.
- **Buttons, pills, tables, empty states.** Primary and destructive buttons carry a contact shadow and
  an inner highlight; the secondary outline rests on `--color-border` (hover to strong) instead of
  being permanently darker than its panel; status pills are capsules; table headers are a stronger
  band; empty-state icons are neutral rather than success green.
- **Phone tab bar.** The lavender band, gradient lift, inset highlight and white icon capsule were
  removed. The bar is the header's surface (white, one hairline, one soft shadow); the current
  destination is a deep-lavender capsule behind its icon with a white glyph; the cart count is action
  purple with white. Six destinations, 64px, unchanged.
- **Floating chrome.** The cart box is centred on the right edge (owner direction, 2026-11-05) and the support rail sits bottom-right above the tab bar (it used to sit at the
  vertical centre, over the merchandise) and is hidden from 1024px, where the header cart replaces it.
  The support rail renders **only on the homepage**, bottom-right on a phone, inline below the browse
  row from 1024px - it used to follow every route and cover the hero on desktop.
- **Storefront card.** Hover lifts with `--shadow-md` and tints toward action ink; the `#C8B6FF`
  hairline (1.81:1) is gone. The price uses the display face.

Verified on a served development build at 390px and 1440px: the homepage, listing, brands and cart
render with no horizontal overflow, the support rail is absent everywhere but `/`, the admin
dashboard and analytics show the new figures, and a throwaway chart page exercised the data states
(30 points, hover tooltip, eight-slice ring) before it was removed. `typecheck`, `lint` (0 errors),
`check:i18n` (1452 keys) and `build` pass. Real iOS Safari, Android Chrome and screen readers remain
unverified.
