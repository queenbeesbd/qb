# Implementation plan

Status: Phases 0-4 complete (2026-10-11). The next phase is an authorised merchant-backend capability audit - not started, and not to begin automatically.

## Phase 0 - audit and foundation (complete)

Delivered `AGENTS.md`, `README.md` and the `docs/` set covering repository and storefront audit, reference pattern analysis, requirements, design direction, architecture, security and delivery plan. No application code, installs or backend access.

## Phase 1 - foundation and client-ready demo (complete)

Next.js 16 App Router with strict TypeScript, npm with committed lockfile, CSS Modules plus tokens, Git initialised. Homepage, catalog with URL-driven search/filter/sort, 5 category routes, product pages, cart, inert checkout preview, 404 and error boundaries. Central dictionaries with enforced parity.

## Phase 2 - UI critique, imagery and refinement (complete)

A focused refinement of the existing storefront. Product imagery, hero composition, an announcement strip, a featured shelf and typography fixes. Architecture, routes, cart, translations and the simulated-checkout boundary left intact.

## Phase 3 - mobile-first UX and discovery refinement (complete)

A focused refinement, not a rebuild. Routes, cart, i18n, security boundaries and the data-access pattern were preserved.

| Workstream | Delivered |
| --- | --- |
| Featured shelf | Two rows replaced by **exactly one row** at every viewport; 4 cards visible on desktop, 2 on mobile, 3 on tablet |
| Curation config | Featured and collection selections moved out of the product record into `src/data/curation.ts` as validated product-id lists |
| Pricing hierarchy | Current price promoted on cards, detail page and cart; comparison price gated on a genuine derived saving |
| Catalog | 6 additional verified products (16 to 22), with photography, provenance and published prices |
| Section honesty | "Recently added" replaced by "More to explore"; the three homepage sections no longer repeat a card |
| Demo wording | Removed redundant explanatory lines, badges and audit notes from the shopping UI |
| Mobile | Homepage category section hidden below 720px; hero, header and spacing made mobile-first |

### Problems found, and why they were real

1. **The featured shelf rendered two rows.** Products flowed column-wise into `grid-template-rows: repeat(2, auto)`, so a shelf meant to be browsed sideways was read as a short grid. Replaced with a single row.
2. **The page overflowed horizontally at 1024px and 768px.** Two independent causes, both confirmed by measurement rather than inspection:
   - The shelf's nested grid reported its entire column set as its minimum width, because grid items default to `min-width: auto`. Fixed with `min-width: 0`.
   - Even with that, `overflow-x: auto` clips visually but still lets the content contribute to an ancestor's scroll width. The row widened the page by 69px at 1024px and 301px at 768px. Fixed with `contain: layout paint` on the scroller - containment fixes the cause, whereas `overflow: hidden` on the parent would only have hidden the symptom.
   - A third, separate cause: between 720px and 880px the header's inline navigation and search could not fit beside the brand and action buttons, overflowing by up to 45px. The nav breakpoint moved to 880px, where the drawer already covers navigation.
3. **"Recently added" was an empty, unfinished-looking section.** No date field exists, so it could never be populated honestly. It is now "More to explore", a curated collection - a section the data can actually support.
4. **The same product could appear twice on the homepage.** The offer row and the collection overlapped the featured shelf. The offer row now excludes featured products and the collection is disjoint from both.
5. **A dead assertion in `check:catalog`.** It compared `discountPercent(...) === -1`, a value the helper can never return. Replaced with a real plausibility bound.
6. **Redundant demo clutter** - photo-source captions, an external source URL, a buy note and a total note - interrupted the shopping experience without adding safety. Removed, while every safety surface was kept.

### Verification-driven corrections

Two of my own assertions were wrong and were corrected rather than worked around:

- A check required all 22 listing images to be loaded, but cards below the fold are lazy-loaded by design, so only the first ~16 ever load. The check now scrolls the page to exercise every asset.
- A "no overflow at 1024px" reading was initially misattributed to the shelf by an element-scan that ignored clipping ancestors. A hide-and-measure test then identified the true source.

### Explicitly not done in Phase 3

Backend integration, real checkout or payment, product descriptions, arrival dates, variant grouping, native-device or screen-reader testing, and any new homepage section beyond the collection that replaced the empty one.

## Verification gates executed

| Gate | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | Pass - 33 routes; 22 product pages prerendered |
| Type checking | `npm run typecheck` | Pass - 0 errors, strict mode |
| Linting | `npm run lint` | Pass - 0 errors, 0 warnings |
| Content integrity | `npm run check:catalog` | Pass - 22 products, 22 with photography, 13 discounts, 6/6 featured, 8/8 collection, locked demo warning active |
| Translation completeness | `npm run check:i18n` | Pass - 128 keys in both locales, placeholders match |
| Browser journeys | `npm run verify:browser` | Pass - **53/53 checks in headless Chromium** |

Browser coverage now includes the Phase 1 and 2 journeys plus: the shelf being exactly one row of six at five viewports, four visible on desktop and two on mobile, correct start/end control states, advancement revealing the remaining products, card and detail price hierarchy, every shown discount recomputed from the stored prices, the three homepage sections sharing no card, the category section absent on mobile while the drawer still reaches five categories, the category anchor hidden with it, the announcement present on every route, and no horizontal overflow on six routes at 320px.

Not verified and must not be claimed: real iOS Safari, real Android Chrome, screen-reader output on real assistive technology, 200% zoom reflow, and any production security control.

## Phase 4 - brand mark redesign and shelf polish (complete)

Two scoped fixes; no redesign of the wider storefront.

| Workstream | Delivered |
| --- | --- |
| Logo | The old unexplained geometric badge replaced by a **crown of three petals over a body band** - a queen bee abstracted to regalia plus a striped abdomen |
| Wordmark | Converted from SVG `<text>` to **real Inter outlines** at weight 600, so the lockup matches the interface type. Inside an `<img>` the old `font-family: var(...)` could not resolve, so the wordmark had silently been a system font |
| Assets | `logo.svg`, `logo-mark.svg`, `favicon.svg` rewritten; the unused `logo-dark.svg` deleted. Paths unchanged |
| Shelf controls | Previous/next moved into the section header, occupying the former "View all" slot; "View all" removed from that section only |
| Defect fix | The lockup was squashing at 320px (measured 3.04:1 against a true 4.33:1) because the global `img { max-width: 100% }` capped width while height stayed fixed. Fixed with `object-fit: contain` and a 26px step-down below 360px |

### Verification-driven corrections

- The controls group and the scroller both carry `role="group"`, which made the browser suite's shelf selector ambiguous - it measured the controls as if they were the shelf. The suite now targets the scroller by class.
- A favicon canvas probe was asserted against only the top four palette entries, so antialias blends broke the count. Fixed to census every pixel.
- Two earlier favicon measurements returned all-white because the probe page was fetched from `/tmp`, which Next does not serve - it was screenshotting the 404 page. Re-measured from a served page.

### Verification gates executed

| Gate | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | Pass |
| Type checking | `npm run typecheck` | Pass - 0 errors |
| Linting | `npm run lint` | Pass - 0 errors, 0 warnings |
| Content integrity | `npm run check:catalog` | Pass - 22 products, locked demo warning active |
| Translation completeness | `npm run check:i18n` | Pass - 129 keys |
| Browser journeys | `npm run verify:browser` | Pass - **57/57** |

New browser coverage: the lockup loads at its declared 173x40, the wordmark is outlined rather than `<text>`, no script or external reference in any SVG, the unused variant returns 404, the metadata favicon is linked, the reversed mark keeps its tile and ink at 16px on light and dark, the featured header holds the title plus two labelled controls with no "View all", the title and controls never overlap, and other sections keep their "View all" links.

### Explicitly not done in Phase 4

Backend integration, real checkout or payment, any new homepage section, redesign of unrelated components, and a Bangla wordmark variant.

## Phase 5 - authorised backend capability audit (next, not started)

Prerequisites (owner-supplied, none available today): explicit written authorisation, a defined test scope, a staging or test tenant, API documentation or access, and permitted read/write actions.

Scope: API inventory and versioning; authentication model; public versus merchant endpoints; catalog field semantics including SKU, variant, stock and price; paging, search and rate limits; account and guest checkout support; order creation, read and cancel permissions; delivery quotes and COD; payment provider, notification verification and refunds; webhooks and idempotency; inventory race behaviour; CORS; backup, restore and operational ownership.

Exclusions: no production writes, no real orders, no live customer data, no security probing outside the agreed scope.

Deliverables: capability matrix, integration architecture decision record, revised security checklist, realistic integration plan with acceptance criteria.

## Phase 6 - integration and hardening (blocked)

Depends entirely on Phase 4. Likely shape: a trusted server boundary owning price, discount, shipping, stock and order authority; server-validated cart; supported authentication with correct CSRF/CORS posture; verified payment notification handling with idempotency; reconciliation for uncertain outcomes. The demo's cart and checkout components must be replaced rather than extended.

## Phase 7 - production release (blocked)

Requires every unchecked item in `docs/security.md`, approved delivery/return/payment policies, confirmed imagery rights, reviewed Bangla product copy, real-device and screen-reader testing, and an operational owner with alerts and a tested rollback.

## Risks

| Priority | Risk | Mitigation |
| --- | --- | --- |
| Critical | Backend capabilities unknown and unauthorised | Audit before any integration commitment |
| Critical | Payment, delivery and returns policy undefined | Owner must supply rules before policy copy or checkout is published |
| High | Photography rights not confirmed in writing (22 products) | Tagged pending; placeholders remain available; resolve before public launch |
| High | Bangla product names are transliterations | Native review required before public launch |
| High | No primary user research | Treat the current IA as a reviewed hypothesis |
| Medium | Lifestyle photography has mixed backdrops | Mitigated by a uniform 3:4 crop and neutral surface, not hidden |
| Medium | Real-device and assistive-technology coverage missing | Schedule device and screen-reader testing in Phase 5/6 |

## Next single step

Owner reviews the Phase 4 result, confirms photography rights, then authorises the Phase 5 backend audit with a defined scope and access. Nothing in Phase 5 begins before that authorisation.
