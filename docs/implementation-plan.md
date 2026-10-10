# Implementation plan

Status: Phase 0 and Phase 1 complete, 2026-10-11. The next phase is an authorised merchant-backend capability audit - not started, and not to begin automatically.

## Phase 0 - audit and foundation (complete)

Delivered `AGENTS.md`, `README.md` and eight documents under `docs/`, covering repository and public storefront audit, reference pattern analysis, requirements, design direction, architecture, security and the delivery plan. Recorded evidence, limitations and open questions. No application code, installs or backend access.

## Phase 1 - foundation and client-ready demo (complete)

Objectives: scaffold the approved stack, build a cohesive bilingual storefront on verified demo data, and prove it with real checks.

| Workstream | Delivered |
| --- | --- |
| Foundation | Next.js 16 App Router, strict TypeScript, npm with committed lockfile, CSS Modules plus token system, Git initialized |
| Design system | Token set with measured contrast, Inter plus Noto Sans Bengali self-hosted, original SVG wordmark/mark/dark variant/favicon |
| Catalog | 16 verified products across 5 reviewed categories, normalized typed schema, integer-poisha money, 16 generated local placeholder images |
| Storefront | Homepage, catalog with URL-driven search/filter/sort, 5 category routes, 16 product pages, cart, inert checkout preview, 404 and error boundaries |
| Bilingual | Central dictionaries (124 keys, parity enforced), locale store with persistence, whole-UI toggle, per-field content fallback |
| Verification | Build, typecheck, lint, catalog check, i18n check, and a 31-check Chromium journey suite - all passing |

Explicitly not done in Phase 1: merchant backend integration, real checkout or payment, product photography, "recently added" listing, product descriptions, and native-device or screen-reader testing.

## Verification gates actually executed

| Gate | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | Pass - 27 routes; 16 product pages prerendered |
| Type checking | `npm run typecheck` | Pass - 0 errors, strict mode |
| Linting | `npm run lint` | Pass - 0 errors, 0 warnings |
| Catalog integrity | `npm run check:catalog` | Pass - 16 products, 5 categories, 9 verified discounts |
| Translation completeness | `npm run check:i18n` | Pass - 124 keys in both locales, placeholders match |
| Browser journeys | `npm run verify:browser` | Pass - 31/31 checks in headless Chromium |

Journey coverage: Bangla default, toggle to English and back, persistence, category browse, search, filter composition, sorting both directions, empty search, product detail, add to cart, quantity change, quantity clamping, refresh persistence, removal, empty cart, corrupt storage, checkout inertness, 404, five viewport widths, mobile drawer focus behaviour, touch targets, breadcrumb targets, reduced motion, skip link, and console health.

Not verified and must not be claimed: real iOS Safari, real Android Chrome, screen-reader output on real assistive technology, 200% zoom reflow, and any production security control.

## Phase 2 - authorised backend capability audit (next, not started)

Objective: establish what the merchant backend can actually do before committing to any integration design.

Prerequisites (owner-supplied, none available today): explicit written authorisation, a defined test scope, a staging or test tenant, API documentation or access, and permitted read/write actions.

Scope: API inventory and versioning; authentication model and credential handling; public versus merchant endpoints; catalog field semantics including SKU, variant, stock and price; paging, search and rate limits; account and guest checkout support; order creation, read and cancel permissions; delivery quotes and COD; payment provider, notification verification and refunds; webhooks and idempotency; inventory race behaviour; CORS; backup, restore and operational ownership.

Exclusions: no production writes, no real orders, no live customer data, no security probing outside the agreed scope.

Deliverables: capability matrix, integration architecture decision record, revised security checklist, and a realistic integration plan with acceptance criteria.

Acceptance: every claimed capability is demonstrated in the approved test environment; anything unproven is recorded as unavailable rather than assumed.

## Phase 3 - integration and hardening (blocked)

Depends entirely on Phase 2 findings. Likely shape: a trusted server boundary that owns price, discount, shipping, stock and order authority; server-validated cart; supported authentication with correct CSRF/CORS posture; verified payment notification handling with idempotency; and reconciliation for uncertain outcomes. The demo's cart and checkout components must be replaced rather than extended.

## Phase 4 - production release (blocked)

Depends on Phase 3. Requires every unchecked item in `docs/security.md` to be evidenced, delivery/return/payment policies approved, imagery rights cleared, Bangla product copy reviewed, real-device and screen-reader testing completed, and an operational owner with alerts and a tested rollback.

## Risks

| Priority | Risk | Mitigation |
| --- | --- | --- |
| Critical | Backend capabilities unknown and unauthorised | Audit before any integration commitment; no assumptions |
| Critical | Payment, delivery and returns policy undefined | Owner must supply rules before any policy copy or checkout is published |
| High | Product photography rights unresolved | Placeholders stay until written permission is recorded |
| High | Bangla product names are transliterations | Native review required before public launch |
| High | No primary user research | Treat the current IA as a reviewed hypothesis to validate, not a proven design |
| Medium | Scope growth into optional features | Deferred list in `docs/requirements.md`; add only with evidence and backend support |
| Medium | Real-device and assistive-technology coverage missing | Schedule device and screen-reader testing in Phase 3/4 |

## Next single step

Owner reviews the Phase 1 demo, then authorises the Phase 2 backend audit with a defined scope and access. Nothing in Phase 2 begins before that authorisation.
