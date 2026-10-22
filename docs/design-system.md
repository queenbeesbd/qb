# Design system

Status: refined through Phase 5 layout-width work (2026-10-11). Tokens live in `src/app/globals.css`; component styles are CSS Modules. Items marked *not built* are explicitly deferred. Current overall state and verification limits: `docs/project-status.md`.

## Direction

Product-led, calm, precise. The shopper compares brand, pack size, price and availability without hunting, and purple/pink are used deliberately rather than painted over every surface. Authentic product photography carries the visual weight.

## Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#A680FF` | Approved brand anchor. Accents and thin borders. |
| `--brand-secondary` | `#F6B3CC` | Approved accent anchor. Sparse supporting surfaces. |
| `--color-action` | `#56358C` | Filled actions with white labels. |
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
| White on `#A680FF` | 2.94:1 | **Fails** - never used for text |
| White on `#F6B3CC` | 1.72:1 | **Fails** - decorative only |
| Ink on `#A680FF` | 5.76:1 | Passes AA |
| White on `#56358C` | 9.20:1 | Passes AAA - all filled actions |
| Muted on white | 5.89:1 | Passes AA |
| Ink on `#F3EDFF` | 14.2:1 | Passes AAA |

## Typography

- **Inter** (variable) for the interface, **Noto Sans Bengali** kept for Bengali *data*, both self-hosted via `next/font`. The interface is English only since Phase 28, but a product name, category name or customer-entered line may still be Bengali, so the second family is not a language feature - it is what keeps owner and customer text from falling back to a system font.
- **Weights are restricted to 400 / 500 / 600 / 700.** Inter is variable but Noto Sans Bengali ships only these four, so an intermediate value (550/650) renders at *different* effective weights across the two scripts. This was a real defect and is now prevented.
- **No letter-spacing on Bengali text.** The document is `lang="en"` since Phase 28, so the `html[lang='bn']` reset no longer fires; the rule stays as the guard it was written to be, and no Bengali heading is letter-spaced by the interface.
- Scale: 12 / 13 / 15 / 16 / 18 / 22 / 28 / 34 px. Body 15px, 1.6 leading.
- No fixed-height text containers, so Bengali conjuncts and long product names never clip.

**One interface language.** There is no language toggle, no locale store and no second dictionary (Phase 28). The header's action cluster holds account and cart only; the drawer lists search, categories and the account routes. A stored `queenbees.locale.v1` value from an older visit is inert: nothing reads it, and `verify:storefront` asserts that writing it changes nothing.

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

Outlined text is not real text, so the SVG carries `role="img"` and an `aria-label` of `QueenBee's` and the header `<img>` repeats `alt={t('common.brand')}`. The accessible name is preserved at every width.

### Header sizing rules

- The lockup renders at a fixed 32px height with `width: auto` and **`object-fit: contain`**.
- The global `img { max-width: 100% }` rule caps the box on narrow screens while the height stays fixed, which would otherwise squash the artwork (measured 3.04:1 against a true 4.33:1 at 320px). Contain keeps the drawn mark proportionate inside whatever box it gets; the leftover space reads as letterboxing, not distortion.
- Below 360px the height steps down to 26px so the lockup and the action buttons keep room.
- The favicon is verified to 16px: the tile remains the dominant colour on both light and dark tab backgrounds, and the reversed symbol keeps its ink.

## Components

- **AnnouncementBar** - one left-aligned line above the header, carrying the owner's saved line only. No background and no second rule: the text starts on the same gutter as the brand, so it reads as the shop's own news rather than a promotion banner (owner decision, 2026-10-23 - it was a centred tinted strip). Absent entirely when that line is empty or switched off (ADR 0020).
- **ProductPhoto** - one `<picture>` for all catalog imagery: WebP source, JPEG fallback, explicit dimensions, `sizes` hints, lazy by default and eager for the detail hero.
- **ProductCard** - 3:4 photo, brand eyebrow, title, pack, price row and a derived saving. No badges, ratings or urgency.
- **Featured row** - the owner's five picks on the standard grid, one product per department. **No carousel**: there is no sixth card hiding off screen, so there are no controls, no horizontal bar and no scroll state to manage (owner decision, 2026-10-23 - it replaced a six-card scrolling shelf).
- **QuantityStepper** - accessible minus/plus with a numeric input clamped to 1..20.
- **Header** - sticky on desktop, static on a phone. From 1024px it is one row in reading order: logo, category navigation immediately after it, then search and account at the far end. The links are centred **vertically** - each is a 40px control - which is the correction the owner asked for after seeing a viewport-centred first attempt. The search field is a real 240px input at 1200px and a compact link to the catalog's own search between 1024 and 1199px. Below 1024px it holds brand, a full-width search field and the two icon controls.
- **StorefrontTabBar** - the phone's only navigation: fixed to the bottom, five destinations (Home, Shop, Categories, Cart, Account), 64px targets, cart count on its tab, `aria-current` on the current section, and `env(safe-area-inset-bottom)` reserved. The shell reserves its height so it never covers the footer.
- **AuthShell** - the two-panel frame shared by sign in, registration and the one-time-code page: a lavender intro panel and a white form panel, stacked on a phone with the intro reduced to the brand and one sentence.

## Admin surface (Phase 18)

The owner panel is the same design system in a different mode: **Operate**, not Persuade. The
storefront earns attention; the panel removes obstacles from a task the owner repeats every day. Its
visual world is a quiet desk in the same shop - a lavender wash for the rail, a paper workspace, plum
ink, hairline rules and typography doing the hierarchy work - rather than a dark console or a grid of
rounded metric cards. The phone is the primary device, and its navigation is a **bottom tab bar** at the
bottom of the screen, not a drawer.

### Tokens added

| Token | Value | Role |
| --- | --- | --- |
| `--color-admin-sidebar` | `#F3EDFF` | Navigation rail: a lavender wash of the storefront canvas, not a dark console. |
| `--color-admin-sidebar-ink` | `#2A2136` | Rail text. 14.2:1 on the rail. |
| `--color-admin-sidebar-muted` | `#6F6480` | Inactive rail labels. 5.6:1 on the rail - AA for body text. |
| `--color-admin-sidebar-border` | `#E6DCF4` | Rail edge and queue-panel outline. |
| `--admin-sidebar-width` | `15.5rem` | Desktop rail width; below 1024px the rail is replaced by the bottom bar. |
| `--admin-topbar-height` | `3.75rem` | Top bar, including the breadcrumb and account menu. |
| `--admin-content-width` | `75rem` | Workspace cap. Narrower than the storefront container because a worklist is read in a column. |
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

- **Rail (desktop):** a lavender wash, brand, then permission-filtered groups - Overview, Commerce
  (COD orders, products, categories), Customers, Settings (delivery charges, announcement), System
  (owner accounts, audit trail) - then a storefront link. The active item is a filled action-purple
  pill with white text; `aria-current` carries the same fact. No border strip is used as a marker.
- **Top bar:** a breadcrumb (Admin / current page) and the account menu (name, email, role, sign out).
  Below 1024px the breadcrumb gives way to the current section name and the brand mark; there is **no
  hamburger and no drawer**.
- **Bottom bar (phone):** four ranked destinations - Overview, COD orders, Products, All orders - plus
  **More**, fixed above the safe-area inset. Labels are 11px under 22px icons, each tab is a 64px
  touch target, and the current tab carries `aria-current` plus a 2px indicator.
- **More sheet:** every remaining destination grouped, the signed-in account, sign out and the
  storefront link. It is a modal surface: focus moves to close, Tab is trapped, Escape closes, body
  scroll locks, and focus returns to the More tab.
- **Overview:** a greeting instead of an eyebrow; the COD queue as a full-width lavender panel with a
  count badge and the oldest wait in one sentence; then recorded revenue and catalog state on the left
  with "needs attention" on the right. On a phone the order is queue, attention, money, catalog.
  The dashboard stops at three queue cards; the full queue is one tap away.
- **Order cards:** reference and age on the top line, name with a 40px `tel:` chip, address, recorded
  lines and totals, then a full-width decision footer with the note and Accept/Reject on one line. The
  old 3px left accent is gone: the card is outlined, and age is carried by its own pill.

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
| Section cards | one per task (General information, Media, Pricing, Organisation, Publication), each with a one-line explanation |
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

### Components

`AdminShell` (rail, bottom tab bar, More sheet, account menu, skip link), `PageHeader`, `Notice` (one polite/alert region
per page), `SubmitButton` (pending state from `useFormStatus`), `ConfirmSubmit` (reason-capable dialog
with focus trap, Escape and focus restoration), `StatusPill`, `EmptyState`, `AvailabilitySwitch`,
`CodOrderCard`, and the Phase 30 list primitives: `ListToolbar`, `ListSearch`, `FilterTabs`,
`DateRangeFilter`, `ActiveFilters`, `Pagination`. All are small local components under
`src/app/(admin)/admin/_ui`; styling stays in `admin.module.css` on the tokens above, and the pure query
helpers live in `src/lib/admin-query.ts` so they are unit-testable without a cluster.

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

- **KPI band** - `.kpiGrid` of `.kpi` cards: a small muted label, the number at `--text-2xl`, and one line
  of context under it that says what the number counts. A figure that cannot be computed reads an em dash
  and its note says why ("No paid order yet"); it never reads zero.
- **`.chartGrid`** - the plot at roughly two-thirds width beside a ring at one-third, collapsing to one
  column below 1080px.
- **`_ui/charts.tsx`** - `AreaChart` and `DonutChart`. Both are stateless, so they render on the server.

**The chart rules that are not negotiable:**

1. The plot is a fixed coordinate space (`viewBox 0 0 640 180`) stretched to its container, with
   `vector-effect="non-scaling-stroke"` so the line stays 2px rather than fattening on a phone. Do not
   draw markers inside a stretched SVG - a circle becomes an ellipse.
2. **Axis text is HTML beside the plot, never SVG text.** Scaled text is either huge or unreadable.
3. The SVG is `aria-hidden` and the same values are emitted as a screen-reader table.
4. **A window with no data draws a sentence, not a line at zero.** Four axis labels that all read "0"
   look like a broken chart.
5. Axis money is compact but proportional: `1.7k` / `3.3k` / `5k`, one decimal between 1k and 10k.
6. Tones come from the palette tokens (action, success, warning, danger, neutral), never raw hex, and a
   ring always ships a legend with the value and the share - colour is never the only signal.

**Recent orders is a list, not a table.** Five columns at 390px shrink every cell to a word fragment, so
the dashboard states the same facts in two lines per order (`.recentList`), which is legible at 320px and
still reads as a row on a desktop.

**Two-column pages finish together.** A page with a tall card in the right column puts a second card in
the left column rather than leaving a long empty margin (`.duoGrid`, `.splitGrid`, `.stack`).

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

*Unverified:* real iOS Safari and Android Chrome, 200% zoom reflow, and screen-reader output on real assistive technology.
