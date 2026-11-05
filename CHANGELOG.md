# Changelog

All notable changes to QueenBee's. Format follows [Keep a Changelog](https://keepachangelog.com/),
with one entry per implementation phase. Versions are not semantic yet: the project has never been
released (0.1.0 in `package.json` is the scaffold version), so entries are grouped by date and phase
number. Phases 0-46 are recorded here in condensed form from `docs/implementation-plan.md`,
`docs/project-status.md` and the git history; the detailed narrative stays in those documents.

**How to update:** every phase adds a dated entry naming the phase, the ADR it implements (if any), the
behaviour that changed, and the verification actually run. Do not record a check that was not run.
No entry may describe a deployment: nothing has been deployed.

---

## [Unreleased]

### Changed - 2026-11-05: brand lavender, circular imagery, browser uploads and a working production target

**Storefront.** The brand anchor changed to the owner's light lavender `#dccfff`; the phone tab bar is
that field with ink labels and a white capsule behind the current icon. The floating cart box is centred
on the right edge at every width and the support rail moved to the bottom-left corner. Category and
brand rails no longer print taglines or product counts under their names, and neither rail carries a
"view all" line beneath it. A brand mark now **fills** its circle with `object-fit: cover`, the same
frame a category photograph uses.

**Browser uploads.** The owner can upload from their computer for product photographs, category
photographs, brand logos and hero banners. `src/server/catalog/uploads.ts` decodes with `sharp`,
applies EXIF orientation, re-encodes each surface to its declared frames, strips metadata and refuses
anything that is not a readable image (4 MB cap). Bytes go to `public/catalog` when writable and to the
configured object-storage bucket; a deployment with neither refuses instead of reporting success. New
route `/hero/[...path]` resolves an uploaded banner from storage. `npm run assets:upload:catalog`
uploads the imported product tree that a deployment does not carry.

**Admin.** The image editors gained their upload forms, previews are circles, and the phone bottom
navigation uses the same lavender field as the storefront.

**Production wiring (not deployed).** The dedicated `queenbees` Neon project now holds the migrated schema
and the restored catalog, with a public `catalog` storage bucket whose imported product tree was uploaded.
Vercel's project environment was pointed at it, including new storage credentials. **No deployment
succeeded:** every new Vercel deployment (CLI and git) is returned as `Blocked` by the account before it
builds, and the MCP connection's OAuth token expired mid-session. The existing production alias therefore
still serves the old 500, and the deployment step remains open.

**Verification.** `typecheck`, `lint` (0 errors), `check:catalog`, `check:i18n` (1465 keys) and `build`
pass. Browser checks were run against the local dev cluster for the tab bar, rails, floating chrome,
sign-in, and one upload through each of the four real admin routes. The full `verify:*` suites and real
devices were not re-run.

### Changed - 2026-11-02: storefront discovery redesign (mobile-first)

The storefront's homepage, category index and product page were rebuilt as a **picture-led, mobile-first
shopping surface**. Everything a customer can buy is still read from the same catalog snapshot; nothing is
mocked, no claim was added, and no checkout, cart, order or admin path changed behaviour.

**Homepage.** New order, chosen for a phone: hero, **offers**, **category rail**, the owner's featured row,
**brand rail**, new arrivals, and the browse row. The hero is a compact band on a phone - headline, two
actions, and a **spotlight row** of the two newest products with their prices - and the three-frame
composition from 1024px up. Offers are a CSS scroll-snap shelf (1.6 cards visible on a phone, four on a
desktop) with previous/next controls and slide jumps above 1024px; there is no autoplay, no timer and no
JavaScript-driven scrolling. The category rail is a strip of **square photographs** on a phone and a
wrapping grid from 720px. The brand rail shows each brand's verified mark, or its initials. Sections never
repeat a product between them.

**Category index.** A grid of **square photographs** (2 across on a phone, 5 from 1024px) with the name, a
one-line label and the real product count, followed by a twelve-brand teaser into `/brands`. Every tile
links to its category page.

**Product page.** The gallery is a **square** on a phone and 4:5 above 480px, and the media column is capped
at 480px on a desktop with the price and facts beside it rather than below a full-height photograph. Title
size is 22px on a phone. A **purchase bar** appears once the gallery and the in-page purchase block have
scrolled away, so the price and the add button stay reachable without covering the first screen. The
breadcrumb now includes the brand and stays on one line.

**Brands.** New `/brands` index and `/brands/<slug>` listing. Every brand tile shows the brand's own logo
where one was verified, and its **initials** otherwise. The listing reuses `CatalogView`, so department,
price, availability, search, sort and paging all work on a brand page exactly as on `/products`.

**Category imagery is owner-managed.** `category` gained `image_key`, `tagline`; `brand` gained `logo_key`
(migration `0012`, additive). The category editor can associate any image from the shop's own asset
inventory, clear it, and edit the one-line label; the storefront then renders that photograph, and falls
back to the category's icon when none is set. `npm run assets:discovery` builds the square category
photographs from a recorded licence list and fetches brand logos from each brand's **own site** (verified by
the domain's `<title>`), writing them into `public/catalog` in the same two-width form product photography
uses. A brand whose logo cannot be verified keeps `logo_key = null`.

**Curation.** `npm run seed:discovery` writes the two curated collections from stated rules over the live
catalog (`featured`: one product per busiest department; `collection`: four from each of the three busiest),
records the shipped category photos and labels, and syncs brand logo keys both ways.

**Honesty.** No rating, review, countdown, "best seller", invented discount or delivery promise was added.
Every price, count and discount on the new surfaces is derived from stored rows.

---
### Fixed - 2026-10-30: the mobile status filter on /admin/orders

Owner report: the sliding **All / Pending / Confirmed / …** filter was hard to use on a phone. Measured first:
at 390px the rail held **659px of tabs in a 358px box**, so four of the eight statuses (Completed, Cancelled,
Returned and part of Delivered) sat behind an edge fade, an active filter past the fold never scrolled into
view, and the fade dimmed the last reachable tab until it looked disabled.

- **Above 720px nothing changes** - the segmented row still shows every option at once.
- **At and below 720px the filter is a 40px disclosure** whose closed summary names the filter in force
  ("Filter by status · Returned"), opening into a list where every status is a **40px row** with its count and
  the chosen one is filled and checked. No swipe, no clipping, no invisible state, and one row of screen
  instead of three.
- The **date-range filter shares that column**, so a phone toolbar reads as stacked 40px rows instead of one
  full-width control beside a 163px pill.
- Both renderings come from the same `FilterTabs` component and the same URLs; only one is ever displayed,
  so the server-side filtering, `aria-current`, bookmarkability and no-JavaScript behaviour are unchanged.
- Analytics' three-period switch is untouched and still visible as chips on a phone.

**Verified 2026-10-30** (headless Chromium against the running app, owner session): at 320/390px the
disclosure is shown and the segmented row hidden, the closed control is **40px** and names the filter, no
sideways scroll (320 = 320, 390 = 390); opening it reveals **8 options, every one 40px**, the accessibility
tree reports `role: DisclosureTriangle, expanded: false -> true`, choosing "Returned" filters the list and the
closed control then reads "Filter by status · Returned"; at 1280px the segmented row is back and the
disclosure is not rendered; analytics keeps its 3 visible period chips; the height sweep on
`/admin/orders`, `/admin/categories` and `/admin/analytics` at 390px finds **40px** for every toolbar control
(48px and 64px belong to the app shell's navigation, not the page). Plus `typecheck`, `lint` (0 errors,
3 pre-existing warnings), `check:i18n`, unit **208/208**, `build` green, and the design detector on the two
changed files returns **no findings**. Docs updated: `docs/design-system.md` (the filter rule, and what may
never be collapsed with it) and `AGENTS.md`.

### Added - Phase 50 (2026-10-30): the product page shows every photograph it has

- **A thumbnail strip under the main frame** on `/products/[slug]`, one button per stored image, in the
  owner's order. Selecting one swaps the main photograph; the chosen thumbnail is marked with shape and
  colour and carries `aria-pressed`, and the strip only exists when there is more than one image, so a
  single-photo product renders exactly as it did.
- The strip is a **scroller inside its own box** (`overflow-x: auto`, `contain: layout paint`), so a
  product with seventeen photographs cannot widen the page. Thumbnails are 72px at the catalog's own 3:4
  ratio (above the phone's 40px touch floor), are real buttons (keyboard operable), and their inner image
  is decorative because the button's label names the photograph.
- Two strings added (`product.gallery`, `product.galleryThumb`); i18n is 1277 keys.

### Verification recorded - Phase 50

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), `check:i18n` 1277 keys, unit **208/208**,
  `build` green.
- Against the **real imported catalogue** (1,605 products, 1,919 photographs): `/products/facial-sheet-mask`
  server-renders **17 thumbnails**; a single-photograph product renders **0**.
- Headless Chromium at 390px on that page: **6/6** - 17 thumbnails, exactly one pressed initially, no
  horizontal overflow (`scrollWidth === innerWidth === 390`), choosing the fifth thumbnail moves
  `aria-pressed` and swaps the main frame to that photograph, and the main image keeps a product
  description as its alt text.
- The admin list's new row photographs were re-checked against the same catalogue: 25 rows, 25 images on
  the first page.
- **Not run:** `verify:browser`, `verify:admin`, `verify:ui`, real devices, screen readers.

### Demo session (local only)

The project was left running on `http://localhost:3000` against the persistent development cluster
(`.dev-pg`, 1,605 products). `demo@queenbees.test` had no recorded password, so a **single-use
credential token** was issued for it through the application's own issuer and redeemed at `/admin/redeem`;
its password is now `queenbees-demo-2026` **in this local database only** (the reset revoked the account's
other sessions). Use `localhost`, not `127.0.0.1`: Next 16's dev server blocks its own dev resources on a
foreign host, and without them no page hydrates.

### Added - 2026-10-30 (owner request): a product photograph on every admin list row

- **`/admin/catalog` shows each product's photograph beside its row**, so the owner can recognise a
  product by sight instead of reading a 40-character vendor name. A 48×64 frame (3:4, the catalog's own
  aspect), lazy-loaded, decorative (`alt=""` - the row's title already names the product), with an empty
  frame rather than a broken icon when a product has no image.
- The image is **derived from the record's key** through a new `imageVariantPath()` in
  `src/lib/images.ts`, which the media panel now uses too instead of hardcoding its path. No stored URL,
  no new asset variant: the 600px JPEG is the only small width the generated set has.
- The list's primary image now falls back to the **first ordered image** when no image is flagged primary
  (`order by is_primary desc, sort_order asc, id asc`), so a row cannot show an empty frame while the
  product's own page shows a photograph.

### Verification recorded

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), unit **208/208**, `build` green.
- Served build with a real owner session: `/admin/catalog` renders **22 rows and 22 frames**, the first
  image path (`/catalog/<key>-600.jpg`) answers **200**; headless Chromium at **320 / 390 / 1440px**
  shows every frame at exactly 48×64 with at least one image decoded (the rest are lazy), and
  `document.scrollWidth <= innerWidth` at each width.
- Not run: `verify:admin`, real devices. No schema change, no migration, no new dependency.

### Changed - Phase 49 (2026-10-30): one receipt route for every order

- **The receipt moved to `/orders/<number>`.** It used to live at `/account/orders/<number>`, which was
  wrong for a guest (no account) and wrong in its access decision: the page branched on the *presence*
  of a session cookie, so a guest whose browser still held an expired or revoked session was treated as
  a customer, redirected to sign in, and could not see the order they had just placed. Anonymous is now
  "no **resolved** session", the same rule the checkout page already uses.
- **One canonical URL, one redirect.** `/account/orders/<number>` now permanently redirects (307, with
  the `placed` marker preserved) instead of rendering a second copy of the same receipt. The order list
  and the post-order redirect both use the canonical path through `src/lib/order-paths.ts`.
- **Guest copy stops pretending there is an account.** A guest sees "Your order" rather than "My
  orders", gets no link to an order list they cannot open, and is told plainly that this address is the
  only way back (the shop publishes no self-service lookup - OD-2 is still unanswered).
- The database still decides what a guest may read: `getGuestOrderDetail` matches `customer_id is null`,
  so a customer's order number is a 404 without that customer's session.

### Fixed - Phase 49

- **AUD-04** - a guest receipt no longer depends on the cookie jar being empty, and no longer lives in
  the account tree.
- **AUD-07** - the header's compact search control (1024-1199px) now links to `/products#catalog-search`
  and the catalog focuses the field on arrival, instead of dropping the shopper at the top of the listing.
- **AUD-10** - the asset inventory is cached in-process against the directory's modification time and a
  copy is handed out, so the admin media panel stops rescanning ~15.5 thousand entries per render.
- **AUD-27 to AUD-31 (documentation drift)** - README route table, `ui_bug.md` closure, the stale
  "noindex demo" wording in `docs/project-status.md`, a pointer from the old plan to this one, and a
  schema-count authority note in `AGENTS.md`.

### Verification recorded - Phase 49

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), `check:i18n` 1275 keys, unit **208/208**
  (the cache-contract test added), `tests/db/orders.test.ts` **14/14** with guest/customer read scoping,
  `build` green with `/orders/[orderNumber]` and the legacy redirect both present.
- The **HTTP customer flow** (`scripts/customer-flow.ts`) against the served build: **34/34**, including
  the updated receipt URLs, the dead-cookie receipt, the legacy redirect, and the pre-existing
  registration, order, replay, foreign-order and banned-customer checks.
- Served build over HTTP: a guest order redirects to `/orders/<number>?placed=1`; that receipt returns
  200 with the "Order placed" heading, the keep-this-link sentence, no "My orders" wording and **no**
  `/account/orders` link; the same receipt returns 200 with a dead `qb_customer_session` cookie; the
  legacy `/account/orders/<number>?placed=1` answers **307** to the canonical URL; an unknown number is
  404.
- Headless Chromium at 1100px: `/products#catalog-search` focuses `#catalog-search` (the compact control
  is visible and the field is rendered).
- **Not run:** `verify:browser`, `verify:admin`, `verify:ui`, real devices, screen readers. The
  flow's first two attempts were contaminated by leftovers from the aborted runs (a replayed idempotency
  key and a recovery-token hash); the tables were cleared and the third run is the recorded one.

### Changed - Phase 48 (2026-10-30): cart safety

- **Clearing the cart takes two deliberate steps.** The single-tap `Clear cart` control is now a
  question in place - "Clear all N items from your cart?" with **Yes, clear cart** and **Keep items** -
  that states the count, names the consequence, has no timer, and cannot be dismissed by scrolling
  away. Focus moves to **Keep items** when it opens, Escape closes it, and both closing paths return
  focus to the trigger. Five interface strings (i18n now 1273 keys).
- No dialog was added and no dependency; the question replaces the trigger inside the cart summary, so
  the answer sits beside the total it would remove.

### Verification recorded - Phase 48

- `typecheck`, `lint` (0 errors, 3 pre-existing warnings), `check:i18n` 1273 keys, unit **207/207**,
  `build` green.
- Served build, headless Chromium (390px): **12/12** - three lines render with the trigger; opening the
  question clears nothing; the prompt states the item count; both answers are offered; focus lands on
  "Keep items"; Escape closes it, keeps every line and returns focus to the trigger; "Keep items" does
  the same; "Yes, clear cart" renders the empty cart and empties the stored cart.
- At **320px** with the question open: `scrollWidth === innerWidth === 320`, block within the viewport.
- **Not run:** full browser/admin/db suites, real devices, screen readers.

### Still open after Phase 49

- The address model question (OD-1) and the guest order lookup question (OD-2) are still unanswered.
- The product gallery (AUD-05), dispatch paperwork (AUD-11), delivery/security work and the policy
  decisions remain scheduled in `docs/implementation-plan-2026-10-30.md`.

### Added - Phase 47 (2026-10-30): checkout integrity, guest promo parity, explicit validation

- **Guest checkout can use a promotion code.** The preview endpoint
  (`POST /api/checkout/promo`) now admits exactly the callers the order route admits, through one
  shared resolver (`src/server/checkout/submission.ts`): a signed-in customer with a session-bound
  CSRF token, or a guest while the owner's switch is on, from this origin. Previously the preview kept
  the session-only guard after guest ordering shipped, so every code failed for a guest with no
  explanation.
- **The checkout form reports what is wrong in its own words.** `CheckoutForm` is `noValidate`, computes
  the invalid fields on submit, renders a named summary in a role="alert", marks each control with
  aria-invalid and focuses the first one. The rules live in `src/lib/checkout-fields.ts` and are shared
  with `parseContact`, so the form and the server cannot disagree about bounds or the phone shape.
- Ten interface strings (summary, one per field, and a sign-in notice for the promo control): i18n is
  now 1268 keys.

### Fixed - Phase 47

- **A repeated guest submission returned a conflict instead of the order it had just created.**
  `loadCreatedOrder` matched `customer_id = 0` as the guest sentinel, and a guest order is written with
  `customer_id is null`, so the replay found nothing and the customer saw "that submission was already
  processed" on a screen with no order list to send them to. The match is now `is not distinct from`,
  with a database test for the guest replay and for a customer who tries to claim a guest's key.
- **Cross-origin and bad-CSRF requests are still refused**, and the guest switch still gates both
  endpoints: with it off, the preview answers 401 and the order route redirects to sign-in.

### Verification recorded - Phase 47

- `typecheck` pass; `lint` 0 errors (3 pre-existing unused-var warnings); `check:i18n` 1268 keys;
  unit **207/207** (7 new in `tests/unit/checkout-fields.test.ts`); `tests/db/orders.test.ts` **14/14**
  against real PostgreSQL (1 new); `build` green.
- Served production build, driven over HTTP: guest preview of an unknown code → 200
  `{"ok":false,"reason":"unknown"}`; cross-origin → 403; invalid lines → 400; guest order → 303 with
  total 87000 (75000 + 12000 delivery); replaying the same key → 303 to the same order with no second
  row; a real 10% code previewed 7500 off and the created order snapshotted 75000/7500/12000/79500 with
  one redemption row; guest switch off → preview 401 and order 303 to sign-in.
- Headless Chromium on the same build: 9/9 checks — the form is `noValidate`, no summary before the
  first submit, an empty submit lists all six problems, focus moves to the recipient name, invalid
  controls carry `aria-invalid="true"`, the page stays on `/checkout`, and correcting the fields
  clears the summary and the marks.
- **Not run:** the full `verify:browser`, `verify:admin`, `verify:ui` and `test:db` suites; real
  devices; screen readers. The probe cluster and its data directory were removed afterwards, and no
  repository state depends on them.

### Still open after Phase 47

- The **address model** question (district + area + city, or a derived city) remains unanswered, so the
  fields were left exactly as they were. It is OD-1 in the plan.

---

## 2026-10-30
## 2026-10-30

### Changed - Phase 46: verification that can fail, and a cadence that respects the clock

- `verify-browser` is catalogue-derived: pagination total, card prices, filter links, a discounted
  sample and the card frame are read from the catalogue under test instead of pinning fixture values.
- A fact a browser cannot establish is now a stated **SKIP** with its reason; a skip is never counted as
  a pass. `verify-storefront` passes `QUEENBEES_EXPECTED_RECENT` so the recency assertion still runs.
- Verification cadence (owner decision): `npm run verify:ui` (nine checks, ~1 minute) per change; full
  suites at a checkpoint or on request; never a suite quoted as evidence for a change it did not cover.
- Guest checkout coverage added to `scripts/customer-flow.ts`: refused while the switch row is absent,
  cross-origin post refused, one guest order with `customer_id = null` and an `order_placed` event with
  `actor_type = 'guest'`, receipt access rules, and cleanup that leaves no order rows.

### Verification recorded

`verify-browser` 91/91 with 7 stated skips on the imported catalogue; `verify:storefront` 95/95 browser
plus 32/32 HTTP; `verify:admin` 200/200; `verify:ui` 9/9.

---

## 2026-10-29

### Changed - Phase 45b: the cart page loads the cart, not the catalogue

- Cart line ids are mirrored into a first-party cookie `qb_cart` (ids only, `path=/`,
  `SameSite=Lax`, 30 days, removed rather than emptied). `/cart` and `/checkout` project only those
  products, taking them from ~81 KB to ~9 KB gzipped.
- A cart/cookie mismatch triggers one bounded refresh, then states that a line could not be loaded;
  `/checkout` refuses to submit in that state.
- New unit tests for the cookie parser (id shape, duplicates, 40-id cap, truncation).

### Added - Phase 45: the storefront stops shipping the catalogue

- Homepage selections resolve on the server; the layout passes the cart only ids; `/cart` and
  `/checkout` receive the compact projection they draw.

### Verification recorded

Headless Chromium cart clicks (cookie written, one and five lines rendered), deleted-cookie recovery,
refused-cookie state, tampered-cookie rejection; `typecheck`, `lint`, `check:i18n` (1249 keys), unit
200/200, database 258/258, `build`.

---

## 2026-10-23

### Added / Changed

- **Phase 44:** the storefront survives the real catalogue - header shows four busiest departments plus
  "All categories" (was fifteen, which made every page scroll sideways), `/products` paginates at 48
  (1,508 DOM nodes instead of 22,752), homepage strip is four tiles, footer lists five plus the index,
  the 245-brand facet scrolls in its own panel. 0 of 44 route × width combinations overflow.
- **Phase 43:** one-off import of the owner's previous store - 1,605 products (128 archived), 245 brands,
  15 categories, 1,919 image derivatives, 528 customers, 559 orders with 1,648 line items and one
  `order_placed` event each, via `npm run import:zatiq -- --reset`.
- **Phase 38 (ADR 0021):** dashboard figures, `/admin/analytics` (7/30/90-day windows, hand-drawn SVG
  charts, no chart library), promotion codes as a rule plus an append-only redemption and an immutable
  `order.discount_minor`; migration `0008`, schema 43 → 45 tables.
- **Phase 37 (ADR 0020):** storefront presentation leaves "demonstration" - demo notice removed, homepage
  order settled as featured, offers, recently added, more to explore.

### Verification recorded

Phase 44: 0/44 overflow combinations, unit 194/194, `typecheck`, `lint`, `check:i18n` (1245 keys).
Phase 38: unit 178/178, database 255/256 (one pre-existing failure the uncommitted migration invalidated),
plus a Chromium walk-through from creating a code to reading a completed order's figures; `verify:browser`
and `verify:admin` were not run against the new screens.

---

## 2026-10-21

### Added

- **Phase 35:** the product editor becomes its own route (`/admin/catalog/new`, `/admin/catalog/[id]`);
  `?new=1` and `?edit=` removed. Explicit validation summary and first-invalid-field focus.
- **Phase 30:** one list vocabulary across the admin lists (toolbar, active-filter chips, empty states,
  pagination).
- **Phase 29 (research):** Zatiq Easy admin reference audit and feature-parity specification.

### Changed

- **Phase 28:** the interface becomes English-only (one dictionary, one `html lang`, no locale store);
  the owner edits the announcement bar at Settings → Announcement.
- **Phase 27:** one admin control scale (`--admin-control` 40px, `--admin-control-sm` 34px growing to 40px
  below 720px), and honest decision feedback.

### Verification recorded

`verify:admin` 97/97 at Phase 35; control-scale sweep added in Phase 27.

---

## 2026-10-20

### Added

- **Phase 23 (ADR 0019):** owner-operated customer credential reset - 256-bit one-time code, stored only
  as a SHA-256 digest, 30-minute expiry, single use, supersedes any earlier code, revokes live sessions on
  issue and on redemption; suspended/deleted accounts refused with one indistinguishable outcome.
- **Phase 22 (ADR 0018):** per-order additional courier costs - immutable amount/description/actor,
  `DELETE` refused, mistakes voided with a required reason; committed in the same transaction as payment
  receipt; dashboard reports four separate amounts and never collapses them. Migration `0005`, 43 tables.
- **Phase 21 (ADR 0017):** COD workflow corrected - payment received and completion are one owner action
  from `shipped` or `delivered`; revenue is derived `sum(order.total_minor)` over completed and paid orders.
- **Phase 20:** order history, order detail and the transition endpoint; customer moderation.
- **Phase 19 (ADR 0016):** three-area delivery charges (Dhaka / Chattogram / Other districts), owner-
  configured, priced server-side, snapshotted on the order; an unconfigured default refuses checkout.
  Migration `0004`, 42 tables.
- **Phase 26:** three recently added products on the homepage by stored `created_at`.

### Verification recorded

Phase 23: unit 140/140, database 234/234, `verify:admin` 150/150, `verify:storefront` 65/65 + 27/27 HTTP.
Phase 22: database 221/221, `verify:admin` 143/143 including recording a cost through the real route.

---

## 2026-10-15

### Added

- **Phase 15:** first-party customer authentication (scrypt, hashed session tokens, idle + absolute
  expiry, account- and source-keyed throttling, customer-scoped CSRF) and atomic, server-authoritative
  order creation with an idempotency key claimed inside the transaction; no reservation, deduction or
  movement is written (ADR 0013).
- **Phase 14 (ADR 0011):** storefront catalog cutover - the storefront reads the database through a
  server-only typed accessor; the fixture survives only as the deterministic local/test seed and a
  development-only opt-in, never as a fallback. No public catalog endpoint.

### Removed / Changed

- Phase 14 removed the storefront's dependency on `src/data/catalog.ts` as the served source.

### Verification recorded

Phase 15: unit 109/109, database 165/165, `verify:admin` 97/97, `verify:storefront` 65/65 + 16/16 HTTP.
Phase 14: database 144/144, `verify:admin` 97/97, `verify:storefront` 65/65.

---

## 2026-10-11 through 2026-10-12 (design and foundation)

### Added

- **Phase 11:** local database foundation - 39-table schema (**40** after `staff_recovery_token`), reviewed
  migrations, server-only typed data access, strict environment validation, least-privilege grants,
  append-only enforcement by revoked grants **and** triggers.
- **Phase 10:** the design of record - `docs/data-model.md` (schema, eight state machines, transactions,
  retention, authorization) and `docs/security.md` (authorization matrix, 16-part threat model).
- **Phase 9:** provider decisions - D1 Neon PostgreSQL, D2 Vercel, D3 Neon Object Storage, D7 manual
  bKash/Nagad/COD (later narrowed), D8 claim fields (later withdrawn), D9 policy, D12 account-required
  checkout.
- **Phase 8 (ADR 0004):** strategic reset to an independent platform; Zatiq Easy becomes a UX reference
  only.
- **Phases 0-7:** audit, working storefront, mobile-first UX, brand mark, layout widths, roadmap reset, and
  the merchant-backend capability audit (authorization spent; do not repeat).

---

## 2026-10-12 onward - owner decisions implemented since

- **ADR 0009:** owner-only administration; availability as an owner state; ban after a confirmed fake
  order, enforced server-side.
- **ADR 0010 / 0013:** availability is the only ordering gate; no reservation; overselling accepted.
- **ADR 0012:** first-party customer identity; no self-service recovery; no external provider.
- **ADR 0015:** Cash on Delivery only; manual prepaid flow removed (routes 404, schema retained unused).
- **ADR 0022:** advisory Telegram order alerts, env-only token, failures swallowed.
- **ADR 0023:** a ban is reversible with a reason and touches no order or session.
- **ADR 0024:** guest checkout behind an owner switch; otherwise sign in with the cart preserved.

---

## Contract for future entries

- One entry per phase, dated, naming the phase number and any ADR.
- Sections: Added / Changed / Fixed / Removed / Security / Verification recorded.
- Every behaviour change names where it is verified. A documentation-only entry says so.
- Nothing is ever recorded as deployed, released or paid for. Provisioning, deployment and DNS changes
  are separate owner authorizations and get their own entries when they happen.
