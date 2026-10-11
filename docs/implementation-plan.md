# Implementation plan

Status: Phases 0, 1 and 2 complete (2026-10-11). The next phase is an authorised merchant-backend capability audit - not started, and not to begin automatically.

## Phase 0 - audit and foundation (complete)

Delivered `AGENTS.md`, `README.md` and the `docs/` set covering repository and storefront audit, reference pattern analysis, requirements, design direction, architecture, security and delivery plan. No application code, installs or backend access.

## Phase 1 - foundation and client-ready demo (complete)

Next.js 16 App Router with strict TypeScript, npm with committed lockfile, CSS Modules plus tokens, Git initialised. Homepage, catalog with URL-driven search/filter/sort, 5 category routes, 16 product pages, cart, inert checkout preview, 404 and error boundaries. Central dictionaries with enforced parity, locale store with persistence. 16 verified products across 5 categories.

## Phase 2 - UI critique, imagery and refinement (complete)

A focused refinement of the existing storefront, not a redesign. Architecture, routes, cart, translations and the simulated-checkout boundary were left intact.

| Workstream | Delivered |
| --- | --- |
| Critique | Screenshots at 5 viewports in both locales, measured hero/type/grid geometry, mechanical detector run over `src/` |
| Announcement strip | Slim configurable strip above the header; typed model with message, enabled, variant, per-locale text and a locked demo entry |
| Product imagery | 16 authentic product photographs retrieved from public pages, normalised to 3:4, exported as WebP+JPEG at 2 widths (68 files), served locally with recorded provenance |
| Featured shelf | Two-row horizontally navigable shelf with bounded group controls, keyboard reachable, no carousel dependency |
| Hero | Empty decorative area replaced with a curated trio of real product photographs |
| Typography | Weight scale normalised to the set both families ship; negative tracking disabled for Bengali; Inter retained with documented rationale |
| Refinement | Removed a detector-flagged side-tab border, fixed cart thumb sizing, translated the photo source note |

### Issues found by the critique

1. **Hero right-hand area was inert.** A 120px logo mark in a 431x120 box left roughly 311px of dead width with no focal point. Fixed with a product-led composition.
2. **Bangla headings carried negative letter-spacing.** The global `h1-h4 { letter-spacing: -0.01em }` rule applied to Bengali, contradicting the documented no-tracking rule and distorting conjunct clusters.
3. **Bangla and English headings rendered at different weights.** CSS requested 650/550; Inter is variable so English rendered exactly, but Noto Sans Bengali ships only 400/500/600/700 and silently substituted.
4. **Side-tab accent border** on checkout notices - flagged by the mechanical detector as a recognisable AI-UI tell.
5. **Product imagery was abstract placeholders**, so the storefront could not be judged as a cosmetics shop.
6. **No announcement strip**, and the demo warning sat in a full-width bar that competed with the header.

### Explicitly not done in Phase 2

Backend integration, real checkout or payment, product descriptions, "recently added" listing, variant grouping, native-device or screen-reader testing, and any new homepage section.

## Verification gates executed

| Gate | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | Pass - 27 routes; 16 product pages prerendered |
| Type checking | `npm run typecheck` | Pass - 0 errors, strict mode |
| Linting | `npm run lint` | Pass - 0 errors, 0 warnings |
| Content integrity | `npm run check:catalog` | Pass - 16 products with photography, 5 categories, 9 discounts, locked demo warning active |
| Translation completeness | `npm run check:i18n` | Pass - 130 keys in both locales, placeholders match |
| Browser journeys | `npm run verify:browser` | Pass - 41/41 checks in headless Chromium |
| Design detector | `detect.mjs --json src` | Clean - the previously flagged side-tab border is resolved |

Browser coverage now includes the Phase 1 journeys plus: announcement strip presence/placement/locales/320px fit, authentic imagery (16 loaded, WebP, 3:4, no remote host), detail photo eager-load with alt and source note, shelf two-row geometry and group advance with end-state control disabling, hero composition, and bilingual heading weight/tracking parity.

Not verified and must not be claimed: real iOS Safari, real Android Chrome, screen-reader output on real assistive technology, 200% zoom reflow, and any production security control.

## Phase 3 - authorised backend capability audit (next, not started)

Prerequisites (owner-supplied, none available today): explicit written authorisation, a defined test scope, a staging or test tenant, API documentation or access, and permitted read/write actions.

Scope: API inventory and versioning; authentication model; public versus merchant endpoints; catalog field semantics including SKU, variant, stock and price; paging, search and rate limits; account and guest checkout support; order creation, read and cancel permissions; delivery quotes and COD; payment provider, notification verification and refunds; webhooks and idempotency; inventory race behaviour; CORS; backup, restore and operational ownership.

Exclusions: no production writes, no real orders, no live customer data, no security probing outside the agreed scope.

Deliverables: capability matrix, integration architecture decision record, revised security checklist, realistic integration plan with acceptance criteria.

Acceptance: every claimed capability demonstrated in the approved test environment; anything unproven recorded as unavailable rather than assumed.

## Phase 4 - integration and hardening (blocked)

Depends entirely on Phase 3. Likely shape: a trusted server boundary owning price, discount, shipping, stock and order authority; server-validated cart; supported authentication with correct CSRF/CORS posture; verified payment notification handling with idempotency; reconciliation for uncertain outcomes. The demo's cart and checkout components must be replaced rather than extended.

## Phase 5 - production release (blocked)

Requires every unchecked item in `docs/security.md`, approved delivery/return/payment policies, confirmed imagery rights, reviewed Bangla product copy, real-device and screen-reader testing, and an operational owner with alerts and a tested rollback.

## Risks

| Priority | Risk | Mitigation |
| --- | --- | --- |
| Critical | Backend capabilities unknown and unauthorised | Audit before any integration commitment |
| Critical | Payment, delivery and returns policy undefined | Owner must supply rules before policy copy or checkout is published |
| High | Photography rights not confirmed in writing | Tagged pending; placeholders remain available; resolve before public launch |
| High | Bangla product names are transliterations | Native review required before public launch |
| High | No primary user research | Treat the current IA as a reviewed hypothesis |
| Medium | Backdrop inconsistency across the merchant's photography | Mitigated by a uniform 3:4 crop and neutral surface, not hidden |
| Medium | Real-device and assistive-technology coverage missing | Schedule device and screen-reader testing in Phase 4/5 |

## Next single step

Owner reviews the Phase 2 result and confirms photography rights, then authorises the Phase 3 backend audit with a defined scope and access. Nothing in Phase 3 begins before that authorisation.
