# Implementation plan

> **This document is the historical record of Phases 0-46.** Phases 39-42 and 44-46 are written up in
> `docs/project-status.md`; the **current** plan, re-audited from scratch on 2026-10-30, is
> `docs/implementation-plan-2026-10-30.md` (phases 47 onward).

Status: Phases 0-8 complete (2026-10-11). **Phase 9 is complete: every blocking decision is owner-approved** - D1 (Neon PostgreSQL), D2 (Vercel), D3 (Neon Object Storage), D7 (manual bKash + manual Nagad + COD), D8 (sender number and transaction reference required, no screenshot), D9 (payment and order policy), D11 (inventory reservation and release) and D12 (account-required checkout). **Phase 10 is complete: the data model, state machines and security architecture are designed and documented** in `docs/data-model.md` and `docs/security.md`. **Nothing is implemented** - no database, migration, dependency, credential or resource exists. **Phase 11 is unblocked but not started**, and nothing beyond Phase 10 is authorized to begin automatically. The owner has approved an **independent e-commerce platform** (`docs/decisions/0004-independent-platform-direction.md`); the previous plan to integrate with the Zatiq merchant platform is **withdrawn**, and Zatiq is now a UX reference only. Nothing beyond Phase 8 is authorized to begin automatically.

**Roadmap revision (2026-10-17, Phase 17, ADR 0015):** the owner has made **Cash on Delivery the only payment method** for this release. The manual bKash/Nagad flow is **removed from the application** and the roadmap is rebased accordingly: **Phase 17** is this COD-only transition and audit (complete locally), **Phase 18** was the admin dashboard UX redesign (now complete locally), **Phase 19** is operational readiness and storefront completion, **Phase 20** is deployment, and an **automated gateway is a future item with no selected provider**. Sections describing earlier phases are kept as history; where they describe prepaid work as pending, that work is **superseded, not outstanding**.

Supporting documents: `docs/platform-architecture.md` (architecture and the decision register in section 11), `docs/payment-workflow.md` (COD workflow; the manual prepaid design is retained as superseded history), `docs/admin-dashboard.md` (dashboard scope, analytics and the Phase 18 design brief), `docs/migration-plan.md` (catalog migration), `docs/security.md` (security requirements), `docs/backend-capability-audit.md` (Phase 7 reference findings).

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

## Phase 5 - layout width and horizontal spacing refinement (complete)

Focused layout change; no redesign, no new sections.

### The problem, measured

The container was 1200px with fixed 16px/24px padding, so content was 1152px wide
and the page used only part of a large viewport:

| Viewport | Content before | Fill before | Margin per side |
| --- | --- | --- | --- |
| 1440px | 1152px | 80% | 144px |
| 1920px | 1152px | 60% | 384px |

The supplied reference capture was measured programmatically (per-column ink
variance, since the image cannot be viewed directly): its content occupies
**94.4%** of the viewport with roughly 24px gutters and no binding max-width.

### The fix

Two tokens, adopted by every piece of chrome so no section can drift:

| Token | Before | After |
| --- | --- | --- |
| `--container` | `1200px` | `1440px` |
| `--gutter` | `16px` mobile / `24px` desktop, per component | `clamp(16px, 2.5vw, 40px)` |

The 1440px cap is derived from the reference rather than chosen by eye: at the
capture's apparent CSS width (~1320px) it does not bind, so the page fills ~94%
there, matching the reference. Above it the cap binds deliberately, which is what
keeps the 4-column product grid from inflating cards.

### Results

| Viewport | Content after | Fill after | Margin after |
| --- | --- | --- | --- |
| 1440px | 1368px | 95% | 36px |
| 1920px | 1360px | 71% | 280px |

Mobile is deliberately unchanged: 16px gutters and identical card widths at 320px
and 375px. The container never binds below 1440px, so the layout is fluid there.

### Two defects the measurement exposed

1. **The header search field overlapped the navigation.** It held its intrinsic
   ~284px width inside a `1fr` track with `justify-self: end`, so once the track
   fell below that width it spilled leftwards (measured **-47px at 1024px**). It
   now stretches to the track and is capped at 720px, which also removed a
   348-500px dead gap between the navigation and the field at wide widths.
2. **The desktop header wrapped to two rows between 880px and 1023px.** At 880px
   the full header needs ~1003px but only had 858px, so the action group wrapped
   and the header grew to 104px. The inline navigation and the drawer trigger now
   swap at **1024px**, on a single 64px row, verified in both locales.

### Rejected approach

Bounding card width with `repeat(auto-fill, minmax(220px, 1fr))` was implemented,
measured and reverted. It kept cards ~224px, but the homepage selections are
curated at 4 and 8 items, so a 5- or 6-column track left 1-4 trailing holes (at
1920px the 8-item row filled only 4 of 6 columns). Explicit column counts were
restored and the container cap now does the work: cards stay 136px on a phone and
322px at 1920px, with no empty cells.

### Verification gates executed

| Gate | Command | Result |
| --- | --- | --- |
| Production build | `npm run build` | Pass |
| Type checking | `npm run typecheck` | Pass - 0 errors |
| Linting | `npm run lint` | Pass - 0 errors, 0 warnings |
| Content integrity | `npm run check:catalog` | Pass - 22 products |
| Translation completeness | `npm run check:i18n` | Pass - 129 keys |
| Browser journeys | `npm run verify:browser` | Pass - **64/64** |

New browser coverage: at all seven viewports the header, main content box and
footer resolve to the same left and right edge; desktop fill is at least 92% below
the cap; mobile gutters stay exactly 16px; product grids keep complete rows with
cards between 200px and 340px; and the inline navigation and drawer trigger swap
at one breakpoint without overlapping or wrapping. The suite's viewport lists were
extended to include 1280px and 1920px.

### Explicitly not done in Phase 5

No new sections or decorative content to fill space, no backend integration, no
change to the brand, typography, colour, logo, catalog or component styling, and
no per-component width overrides.

## Phase 6 - project re-audit and roadmap reset (complete)

A documentation and roadmap audit. Verified repository state against Git history, source and recorded checks; corrected stale counts and phase claims; added `docs/project-status.md`; added the mandatory end-of-task planning rule to `AGENTS.md`; renumbered the roadmap. No application code changed.

## Phase 7 - merchant backend capability audit (complete)

A read-only audit of the Zatiq Easy merchant dashboard, performed under explicit owner authorization with credentials supplied locally. Full findings, evidence labels and limitations are in `docs/backend-capability-audit.md`.

| Result | Detail |
| --- | --- |
| Environment | Production multi-tenant third-party SaaS (Vercel-hosted; Zatiq Easy). No staging tenant exists |
| Modules inventoried | Orders, Products, Categories, Customers, Courier, Manage Shop (13 sub-sections), Promo Codes, Analytics, Themes, Theme Builder, Landing Pages, Mobile App, Spotlights, Users & Permissions, Subscription |
| Auth observed | NextAuth-style credential flow on the dashboard origin; separate API origin `easybill.zatiq.tech` with CORS preflight |
| Documented API | **None found.** No API docs, keys, or webhooks |
| Tenant catalog | **Empty** - 0 products, 0 categories |
| Live storefront | 24 products under Zatiq shop id `42239` |
| Data modified | None. No order, payment, message, export or customer record touched |
| Credentials exposed | None. Read from `.env` in-process only; never printed, logged or committed |

### The blocking finding

The audited tenant reports an empty catalog while the live storefront publishes 24 products. Until the owner confirms whether the supplied credential owns the storefront's shop, **every capability conclusion here is provisional** and no catalog integration can be designed.

### Explicitly not done in Phase 7

No integration code, no write of any kind, no order or payment action, no customer-data access, no vulnerability testing, no new dependency, and no change to application code.

## Phase 8 - strategic reset to an independent platform (complete)

A documentation and planning phase. The owner confirmed that QueenBee's is built as an independent e-commerce platform with its own backend, database, admin dashboard and commerce workflows. No application code was written.

| Deliverable | Where |
| --- | --- |
| Approved direction decision | `docs/decisions/0004-independent-platform-direction.md` |
| Architecture proposal with evaluated options | `docs/platform-architecture.md` |
| Admin dashboard scope and analytics design | `docs/admin-dashboard.md` |
| Catalog migration workflow | `docs/migration-plan.md` |
| Revised requirements, security requirements and roadmap | `docs/requirements.md`, `docs/security.md`, this document |
| Permanent project rules | `AGENTS.md` |

**Key outcome:** the roadmap is no longer blocked on an unavailable third-party API. It is now blocked on owner infrastructure decisions, which are answerable.

### Explicitly not done in Phase 8

No backend, database, admin dashboard or API was scaffolded. No dependency was added. No stack was selected. No migration was performed. No application code changed.

## Remaining roadmap

No launch date is promised. The remaining scope depends on implementation and on external arrangements (couriers, image rights, operational staffing) that are not yet settled. Phases are gated by evidence, not calendar estimates.

**Two tracks.** *Storefront-demo work* keeps the existing demonstration correct and can proceed independently. *Production-launch work* builds the independent platform. They meet at Phase 14, where the storefront starts reading authoritative data.

### Owner gate - before Phase 10 (closed)

Every question that blocked Phase 10 is answered, so the gate is **closed** and Phase 10 is unblocked. Phase 10 still requires explicit owner authorization to begin.

**Answered (owner, 2026-10-11):**

1. **D9 - unpaid-order expiry: 24 hours from placement**, applying **only** to orders with no submitted payment claim. An order awaiting verification never expires automatically. **Amended by ADR 0014:** expiry is **deferred and not a launch priority** - no scheduler or expiry job is added now - and under ADR 0013 there is no reservation to revive; revival would re-check current availability.
2. **D9 - cancellation after the window: support decides before dispatch**, and after dispatch the case becomes a **delivery cancellation / return**.
3. **D9 - COD lifecycle: owner approval before dispatch**, support cancellation before dispatch, the return workflow after, return-to-store on failure, and **separate delivery-completion, cash-collection and reconciliation states**.
4. **D11 - allocation bound: at most one active submitted claim per order** (implemented). **Amended by ADR 0013/ADR 0014:** no unit is reserved or allocated and overselling is accepted, so this bound and payment priority govern the **verification queue**, not a contested physical unit.

These fix the **schema and transaction shape** and the **order state machine**, which is why Phase 10 was held.

**Approved and closed:** D1 (Neon PostgreSQL), D2 (Vercel), D3 (Neon Object Storage), D7 (manual bKash + manual Nagad + COD), D8 (sender number and transaction reference required, no screenshot), **D9** (payment and order policy, including expiry, cancellation and the COD lifecycle), **D11** (inventory reservation and release), and D12 (account-required checkout).

**Not blocking Phase 10** (needed later, no rework cost): payment recipient accounts; courier providers and COD cash settlement; notification channels; reconciliation cadence; sufficient-evidence definition. *(The staff authentication approach and verifying roles - D10 and D13 - were on this list; both were settled on 2026-10-12 in ADR 0009.)*

**Standing prohibitions** unless separately authorized in writing: real orders, real payments or refunds, customer-data collection, customer communications, and security testing outside an agreed scope. The Phase 7 authorization for the merchant dashboard is spent; do not log in there again.

**Non-technical blockers, independent of all the above:** written photography reuse permission, and native review of the Bangla product names.

**Parallel work that does not need any of this:** visual review of the Phase 4 logo and Phase 5 widths, real-device and assistive-technology checks, and the storefront-demo acceptance items listed at the end of this document.

### Phase 9 - infrastructure and provider decision review (complete)

- **Objective:** convert the architecture proposal into approved decisions so implementation can begin without rework.
- **Status:** **complete.** Every blocking decision is owner-approved and the Phase 10 gate is closed. Nothing is provisioned.
- **Approved in addition to D1 and D2:**
  - **D3 Image storage:** **Neon Object Storage** (ADR 0006). Initial plan **Free** (5 GB/project); paid rate $0.023/GB-month. Singapore region, `public_read` delivery with `private` for sensitive assets, branch-scoped credentials.
  - **D7 Payment methods:** **manual bKash**, **manual Nagad**, and **Cash on Delivery**. COD is a **distinct method**, not a variation of prepaid MFS. **No automated gateway is authorized.**
  - **D8 Payment fields:** **sender mobile number required**, **transaction ID/reference required**, **screenshot not required**. Recipient details owner-configurable, never hardcoded. Customer-submitted details are never proof of payment.
  - **D12 Checkout:** **account required.** Guests may browse and build a cart; login or registration is required to place an order, with the cart preserved and the customer returned to checkout. Guest checkout must not be silently reintroduced.
- **D9 - approved, amended by ADR 0014.** Binding: the **24-hour verification maximum** (internal, explicitly **not** a customer-facing promise); the **exceptions queue** so a genuine payment is never silently discarded and is never released by a timer; **fake-order findings** with an audited reason and actor plus a **separate** customer review flag; the rule that **`rejected` is not an accusation**; **cancellation through support**; **manual refunds** with separate `requested`/`processing`/`completed`/`failed` states; **COD owner approval before dispatch**; the **state separation**; **cancellation after the window** as a pre-dispatch support decision or a post-dispatch return; and the **full COD lifecycle**. **The 24-hour unpaid-order expiry is deferred (ADR 0014):** the binding rule is that a **submitted claim never expires**. Text: `docs/payment-workflow.md` sections 13.1-13.9.
- **D11 - approved; superseded in effect for launch by ADR 0013.** The owner's rule: the **first submitted payment claim** is observed first. An order that has submitted a claim is **never** preempted and **never** released by a timer. The implemented bound is **at most one active submitted claim per order**. With no unit reserved there is **no allocation, no preemption and no release**, and **overselling is accepted**; a return makes nothing sellable until it is physically received and inspected. Full analysis: `docs/payment-workflow.md` section 13.10.
- **No unresolved decision remains.** D9 and D11 are fully approved; the deferred entries (D5, D6, D15, D16) are named in the register and do not block Phase 10. (D10 and D13 were deferred at this point and were later settled in ADR 0009.)
- **Approved (owner, 2026-10-11)** - recorded in `docs/decisions/0005-neon-postgresql-and-vercel-hosting.md`:
  - **D1 Database:** **Neon PostgreSQL**, initial plan **Free**, upgrade to a paid plan (~$15/mo) when justified by measured usage or operational need.
  - **D2 Hosting:** **Vercel**, initial plan **Hobby (free)**, upgrade to **Pro** (~$20/mo) when required.
  - **Cost policy:** keep initial costs as close to zero as reasonably possible; do not upgrade pre-emptively; recheck provider pricing and plan terms before implementation and before any upgrade recommendation. The $15 and $20 figures are the owner's intended future budget, not guaranteed permanent prices.
- **Deliverables produced:** an evidence-based proposal for every blocking decision in `docs/platform-architecture.md` section 11, with verified pricing, alternatives, lock-in and recovery implications; the manual payment workflow design in `docs/payment-workflow.md`; payment controls added to `docs/security.md`; the verification queue specified in `docs/admin-dashboard.md`.
- **Owner questions:** none outstanding. The four questions that blocked Phase 10 were answered on 2026-10-11 and are recorded in the gate above.
- **Dependencies:** the owner's own business knowledge, merchant arrangements and policy decisions. No credentials are needed for the approval itself.
- **Acceptance:** every decision in the register is recorded as approved, deferred with a stated reason, or explicitly blocking. **Met** - D1, D2, D3, D7, D8, D9, D11 and D12 are approved, and the rest are deferred with reasons.
- **Verification gate:** a signed-off decision record exists (this register and ADRs 0005-0006). **No implementation phase begins against an unapproved stack, and no resource is provisioned on the strength of this phase.**
- **Risks:** a plan tier that proves insufficient under real load; an approved policy proving impractical in operation and needing owner revision.
- **Owner approval required: none outstanding for this phase.** **Out of scope:** writing code, provisioning infrastructure, creating accounts, deploying, changing DNS, and writing any expiry job or automatic stock-release logic.

### Phase 10 - data model and security architecture (complete - design only)

- **Objective:** fix the schema and the security model before any backend code exists.
- **Status:** **complete as a design.** The deliverables below are documented, reviewed and internally consistent. **No implementation was performed and none is authorized by this phase.**
- **Deliverables produced:**
  - **`docs/data-model.md`** - the existing-system baseline and its discrepancies; 13 schema conventions; a Mermaid ER diagram; **35 tables** specified column by column with primary keys, foreign keys, nullability, unique and `CHECK` constraints, indexes, authorization boundaries, retention rules and allowed transitions; **eight separate state machines**; the transaction, concurrency and locking design; the authorization matrix; the image-storage and upload architecture; the authentication architecture; and migration, rollback and operational safety.
  - **`docs/security.md`** - an authorization matrix for guest/customer/support/admin/owner and a 16-part threat model, each entry with scenario, impact, control, detection, verification method and residual risk.
  - **Corrected contradictions** across `docs/payment-workflow.md`, `docs/platform-architecture.md` and `docs/admin-dashboard.md`, recorded in the change log in `docs/data-model.md` section 1.4.
- **Dependencies:** Phase 9, complete. Phase 10 was explicitly authorized by the owner for architecture, schema design, security analysis and documentation only.
- **Acceptance:** every entity and transition is specified; server authority is explicit per field; no client-authoritative value remains; the schema and state machines are consistent with the approved D9 rules and the decided D11 model. **Met** - acceptance criteria A1-A13 in `docs/data-model.md` section 17.5 are satisfied.
- **Verification gate:** cross-checked against D9 and D11; the one-active-claim-per-unit bound, the no-auto-expiry-of-a-submitted-claim rule, the refund/stock separation, and the COD state separation are each reflected in both the schema and the state machines. **A14 is deliberately unmet:** the concurrency guarantees are reasoned and structurally constrained but **not executed**, because no database exists. Claiming otherwise would be unverified.
- **Risks:** modelling variants too late (mitigated: the inventory ledger points at the stock-keeping unit from the start); money and bilingual conventions drifting from the storefront's existing rules (mitigated: integer poisha and paired `bn`/`en` columns are schema-level constraints); the customer-auth design being deferred and forced in later (mitigated: designed in section 15).
- **Owner decisions:** **D17 (customer authentication provider) is newly raised and blocks implementation of checkout.** D10, D13-D16 remain open and do not block the design. *(Recorded as at the time of this phase: D10 and D13 were settled on 2026-10-12 in ADR 0009, and **D17 on 2026-10-15 in ADR 0012**. **D16 remains open but no longer blocks Phase 16**, because ADR 0014 defers the expiry sweep.)* **Out of scope, and not performed:** application code, migrations, dependency installation, environment or configuration changes, credential creation, provisioning, deployment, DNS, and any expiry job or automatic stock-release logic.

### Phase 11 - independent backend foundation (complete - local only)

- **Objective:** stand up the platform skeleton with no commerce behaviour yet.
- **Status:** **complete, locally.** Implemented and verified against a disposable local PostgreSQL cluster. **Nothing is deployed and no cloud resource exists.**
- **Decisions resolved to unblock it:** **D14** - Drizzle ORM + drizzle-kit, pinned to stable `0.45.x`; and the driver question it raised - **`@neondatabase/serverless` Pool over WebSockets** for the deployed runtime, because the D11 claim-allocation transaction is interactive and Neon's HTTP driver is documented as non-interactive only. Both recorded in **ADR 0007** as **D14** and **D18**. Migration `0001` establishes the full approved schema (owner decision, 2026-10-11).
- **Deliverables produced:**
  - **Schema:** all 39 approved tables in `src/db/schema/`, with 209 CHECK constraints, 13 partial unique indexes and 8 guard triggers. (Phase 12 added a 40th table, `staff_recovery_token` - `docs/data-model.md` 4.9.)
  - **Migrations:** `drizzle/0000_baseline_schema.sql` (generated, reviewed) and `drizzle/0001_guards_and_privileges.sql` (hand-written: append-only enforcement, order immutability, state-transition guards, the privileged-permission rule).
  - **Typed data access:** `src/db/client.ts` is the only place a connection is created, and it is server-only. `withTransaction` provides the interactive transaction the design requires.
  - **Configuration and secrets:** `src/server/env.ts` validates and fails safely, and throws if imported into a client bundle. `.env.example` carries placeholders only. `npm run check:secrets` scans tracked files and the built client bundle.
  - **Migration commands:** `db:generate`, `db:check`, `db:status`, `db:migrate`, `db:validate`, `db:grants`.
  - **Tests:** unit tests for configuration and schema integrity; integration tests exercising every constraint and the concurrency invariants against real PostgreSQL.
  - **CI:** `.github/workflows/ci.yml` - checks job plus a database job using a PostgreSQL service container. No deploy step and no secret.
  - **Documentation:** `docs/database.md`, plus ADR 0007.
- **Dependencies:** Phase 10 schema (complete); owner authorization for local implementation (granted 2026-10-11).
- **Acceptance:** a clean environment is reproducible from the repository alone; migrations apply from empty and re-apply idempotently; no secret is committed and the client bundle contains no server-only marker; the typed data-access layer is the only path to the database. **Met** - with one deliberate exception: **a rollback is not exercised**, because the chosen tooling generates no down-migrations and the documented strategy is forward-fix plus rehearsed restore. That is a documented limitation, not a passing check.
- **Verification gate:** migrations applied from empty, schema validated against the migration files, every constraint and guard exercised, and the Phase 10 concurrency invariants - the oversell backstop, the one-active-claim bound, idempotent release and expiry exclusion - **executed against real PostgreSQL**, which is what converts Phase 10's unexecuted acceptance criterion A14 into evidence.
- **Risks:** environment drift between local and deployed (unverified - no deployment exists); the driver's pooler semantics differ from local TCP; provisioning cost remains unmeasured.
- **Owner decisions:** **D17 (customer authentication provider) still blocks implementation of checkout.** D10, D13, D15 and D16 remain open and do not block this phase. *(Recorded as at the time of this phase: D10 and D13 were settled on 2026-10-12 in ADR 0009, and **D17 on 2026-10-15 in ADR 0012**.)* **Out of scope, and not performed:** provisioning, deployment, DNS, credential creation, any storefront or admin UI, any provider integration, and any commerce feature.

### Phase 12 - Owner/Admin Authentication & Dashboard Foundation (implemented locally; not deployed)

- **Status (local):** implemented and verified against a disposable local PostgreSQL cluster and the real production build. `npm run verify:admin` passes **57/57**; `tests/db/auth.test.ts` adds 25 database tests over the session, throttle, audit and redemption behaviour. Migration `0002` adds `staff_recovery_token`, so the schema is now **40 tables**. **Not deployed:** no cloud resource, credential or deployment exists, and provisioning is a separate owner authorization.

- **Objective:** protect the **private administrative interface for this store's owner**, so the owner can sign in safely to a real, authenticated shell. This is **not merchant onboarding**: QueenBee's is a single-store shop (ADR 0008), so there is no merchant registration, no seller dashboard and no multi-store switcher to build.
- **Deliverables:** owner login with hashed credentials; server-side sessions in httpOnly cookies with creation, expiry, revocation and logout; owner-issued credential recovery (no mail provider is authorized, so recovery cannot depend on email delivery); server-side authorization enforced on every administrative route and mutation; an auditable administrative activity trail; a minimal admin shell consistent with the existing design system and bilingual labels.
- **Optional, and conditional:** staff accounts and permission grants, **only** where a documented requirement justifies them and the owner explicitly approves. A large multi-role workforce is not assumed.
- **Dependencies:** Phase 11 (complete).
- **Acceptance:** unauthenticated access to every admin route is refused server-side; an actor without the permission cannot perform the action even by direct request; no administrative credential or session token reaches the client bundle; sessions expire, revoke and log out correctly; audit entries are written for a test change.
- **Verification gate:** authorization tests per role, plus a session and cookie inspection.
- **Risks:** treating UI hiding as authorization; a weak recovery flow; over-building a role model for staff that the requirements do not justify.
- **Owner decisions:** **settled in ADR 0009.** **D13:** first-party email and password, with Resend email verification and Google sign-in deferred. **D10:** owner role only, multiple owners permitted with full access each, and **no staff or support roles or permission-management system in the launch surface**. That last point creates a **recorded follow-up**: this phase's staff screen and role grant/revoke endpoints are outside the approved launch surface and must be removed or made unreachable before launch. **Out of scope:** product, order or analytics features, and **all customer authentication** - that is D17 and belongs to the checkout phase.

### Phase 13 - product and category management with catalog API (complete - local only)

- **Objective:** the **owner** can maintain the real catalog, and a database-backed read layer exists for the storefront to consume.
- **Status:** **complete, locally.** Implemented and verified against a disposable local PostgreSQL cluster and the real production build. `npm run verify:admin` passes **97/97**; `tests/db/catalog.test.ts` and `tests/db/owners.test.ts` add 37 database tests. Migration `0003` adds `product.availability`. **Nothing is deployed and no cloud resource exists.**
- **Deliverables produced:**
  - **Product CRUD** with bilingual name and description, brand, category, pack size, integer-poisha price and comparison price, SKU, publication status and the **availability state**. Prices live on the product's single default variant, which is where the schema puts them.
  - **Category CRUD** with bilingual names and descriptions, display order and visibility.
  - **Brand creation**, because `product.brand_id` is `NOT NULL` - a prerequisite rather than a module.
  - **Product imagery from existing local assets only.** The key is validated against a server-controlled inventory derived from `public/catalog`, and `content_type`, `width`, `height` and `byte_size` are read from the **file bytes** (JPEG/WebP header parsers, no new dependency). Nothing about an image comes from the request except the key and the alt text.
  - **Owner-account management**, replacing the staff and role screen: create an owner (the role is forced, never chosen), issue a single-use credential token, enable or disable an account, with the last-active-owner guard enforced under a row lock.
  - **The authoritative orderability check** (`src/server/catalog/orderability.ts`), which refuses an unpublished, archived or out-of-stock product from database state alone.
  - **A database-backed read layer** (`src/server/catalog/read.ts`) and an authenticated read API (`GET /api/admin/catalog`).
  - **Documentation:** ADR 0010, plus updates to `docs/data-model.md` 5.2, `docs/database.md`, `docs/security.md`, `docs/admin-dashboard.md`, `docs/catalog.md` and `docs/requirements.md`.
- **Migration `0003`** (`drizzle/0003_product_availability.sql`) is **purely additive**: the column, its `CHECK` constraint and one partial index. No table was dropped or rewritten and the inventory tables are untouched.
- **Dependencies:** Phase 12 (complete locally).
- **Prerequisites, each resolved before implementation:** (a) **ADR 0009 section 1** - the availability model - **closed in ADR 0010** as a bare owner toggle, with the oversell risk recorded; (b) the **role-management follow-up** - the Phase 12 staff and role screen, its navigation entry and its four API routes were **removed**, and the retired paths now 404; (c) **image storage** - upload and object storage remain deferred, so imagery is association-only.
- **Acceptance:** a product created in the dashboard is retrievable through the read layer with correct bilingual fields and integer-poisha prices; unpublished products do not appear publicly; **availability changes persist and are audited with the authenticated owner**; an out-of-stock product fails the server-side orderability check; a denied mutation leaves the database unchanged and produces a durable denial record. **Met.** One acceptance line is **deliberately not met and was corrected rather than faked**: the original wording said *"stock edits are recorded as inventory movements"*, which contradicts the owner's ruling that this phase is a simple availability toggle and not quantity management. **No inventory movement is written** (ADR 0010), and `inventory_balance`, `inventory_movement` and `stock_reservation` remain implemented and unused.
- **Verification gate:** create/edit/archive round trip, bilingual and money assertions, availability persistence with its audit record, the orderability refusal, image metadata derived from real files, and the refusals over real HTTP with their database effects - all executed. `npm run verify:admin` (97/97), `tests/db/catalog.test.ts`, `tests/db/owners.test.ts`, plus the unchanged storefront suite (`verify:browser`, 64/64).
- **Explicitly not done, and not claimed:** the **storefront was not cut over** - `src/data/catalog.ts` and its synchronous accessors are unchanged and the storefront still renders the local fixture catalog; there is **no public catalog endpoint**; there is **no image upload**, no object storage, no derivative generation from an upload, and no curation editor; **no inventory movement, deduction or reservation** is written; there is **no customer account, checkout or order**; and `product_variant` remains a single default variant per product, so variant combinations are still deferred.
- **Risks:** the acknowledged **oversell risk** recorded in ADR 0010, because availability is a state and nothing counts units; a catalog whose imagery cannot yet be uploaded; and `product_image.base_key` being globally unique, so one asset belongs to at most one product.
- **Owner decisions:** none outstanding for what was built. **Deferred and needing an owner decision later:** image storage and rights, and whether the quantity ledger becomes the allocation backstop in Phase 15. **Out of scope:** orders, payments, analytics, customer authentication.

### Phase 14 - storefront cutover to the authoritative catalog (implemented locally; not deployed)

- **Objective:** make the **database** the storefront's catalog, read server-side only, against a **local, disposable PostgreSQL** cluster.
- **Status:** **implemented locally (2026-10-15); not deployed.** The storefront reads the database through the server-only typed accessor contract, and the fixture is demoted to a seed and a development-only opt-in (ADR 0011). Verified against a disposable local cluster and a real production build: `test` 86/86, `test:db` 144/144, `verify:admin` 97/97, `verify:storefront` 65/65 browser checks, plus `typecheck`, `lint`, `check:catalog`, `check:i18n`, `check:secrets`, `db:rehearsal` and `build`. Full evidence and limits in `docs/project-status.md`.
- **Deliverables:**
  - A server-only catalog loader (`src/server/catalog/storefront.ts`) over the Phase 13 read accessor (`src/server/catalog/read.ts`), projecting records into the source-agnostic view shape and marking `source: 'database'`.
  - **Server-side reads only.** **No public catalog endpoint** (ADR 0011): the storefront reads in server components and passes serializable props to the client views, so a public surface with no consumer is not created.
  - **Dynamic routes** (`force-dynamic`), so a build performs no database access, and **one catalog snapshot read per request**, shared by the layout and the pages.
  - **Local/test seeding of all 22 fixture products** (`npm run db:seed:catalog`), idempotent and deterministic, so the cutover is verified against the catalog the fixture described. Seeding is local/test only and is **not a migration**.
  - **Search** derived from the product **name (both locales), brand and pack/size** only. There is **no tags feature** and `description` is not searched.
  - **Explicit handling of an empty or unavailable catalog** - a stated gap, never a zero-filled grid and never a fixture substitution.
  - The **fixture fallback** is an explicit, **development-only** opt-in (`QUEENBEES_STOREFRONT_FIXTURE=1`), **off by default**, **refused outside a development environment**, and **never triggered by a database read failure** (a failure propagates to the error boundary). This supersedes the earlier "demo fixtures retained as a fallback for local development" wording.
- **Dependencies:** Phase 13 (complete locally).
- **Known work this phase must do, established during Phase 13:** the fixture accessors were **synchronous** and six `'use client'` components imported them at module scope, so a database-backed storefront requires **async accessors** and catalog data reaching those components as **props or context** rather than module imports - a client component cannot import `src/server/` or `src/db/`. `(storefront)/products/[slug]/page.tsx` also called the accessor synchronously in `generateMetadata` and `generateStaticParams`, so prerendering had to be reconsidered. The **typed shape** of the contract survives; the synchronous module-import delivery does not. One check that previously needed no database now needs a **seeded, served build**: `npm run verify:browser`, orchestrated by `npm run verify:storefront` (disposable cluster → migrate → seed → build → serve → browser suite → tear down). Two expectations recorded during Phase 13 proved wrong and are corrected here: `npm run build` needs **no** database, because every storefront route is `force-dynamic`; and `npm run check:catalog` still reads the fixture lists - which are the seed input - with no database. That work was deliberately **not** done in Phase 13, which is why the storefront rendered the fixture through Phase 13.
- **Acceptance:** the storefront renders products, categories, prices and imagery from the **database**, through the typed accessor contract, with no view component reading SQL or importing a server-only module; **no fixture record is presented as a database record, or the reverse** (the `source` discriminator); price, pack size, brand, category and availability match what the owner set, asserted by a parity check; an empty or unavailable catalog renders as a **stated gap**, never stale, invented or zero-filled data; and the storefront's existing checks pass against the seeded database.
- **Verification gate (executed 2026-10-15 against a disposable local cluster and a real production build):** `typecheck`; `lint` (0 errors, 2 pre-existing unused-import warnings); `check:catalog`; `check:i18n` (344 keys); `check:secrets`; `test` (**86/86**, 17 suites); `test:db` (**144/144**, 22 suites, including the new `storefront` and `storefront-empty` files); `db:rehearsal`; `build`; `verify:admin` (**97/97**); `verify:storefront` (**65/65** browser checks against the seeded database, asserting that the served catalog is the database and not the fixture); `git diff --check`. A parity check compares the rendered listing and the seeding report against the fixture's declared 22 products, 5 categories, 6 featured and 8 collection ids.
- **Risks:** accidental client-side fetching of authoritative data; `verify:browser` now requiring a seeded, served build where it previously needed none (mitigated by `verify:storefront`, which provisions the cluster, seeds it and tears it down); a seed that drifts from the fixture.
- **Owner decisions:** **settled in ADR 0011** - no public catalog endpoint, and the remote-database scope is settled by inspection (no QueenBee's-bound remote database exists and none was created; the only reachable Neon project belongs to a different product and is out of scope). **Out of scope:** checkout, orders, payments.

### Phase 15 - cart validation, customer authentication and order creation (implemented locally; not deployed)

- **Status:** **implemented locally (2026-10-15); not deployed.** Customer accounts, server-authoritative atomic order creation and customer-owned order reads exist against a disposable local PostgreSQL cluster. `test` **109/109**, `test:db` **165/165** (10 customer-authentication and 11 order-creation database tests), `verify:admin` **97/97**, `verify:storefront` **65/65** browser checks plus **16/16** HTTP customer-flow checks, plus `typecheck`, `lint`, `check:i18n`, `check:catalog`, `check:secrets`, `db:rehearsal` and `build`. **No migration:** the schema stays at **40 tables**. Full evidence and limits in `docs/project-status.md`.
- **Objective:** create real orders with server-side authority and no duplicate risk, behind a real customer account.
- **Deliverables:** **customer registration, sign-in and session handling** on the **D17 model (ADR 0012)** - email and password, scrypt hashing, opaque 256-bit session tokens stored only as a SHA-256 hash, httpOnly `SameSite=Lax` cookies with idle and absolute expiry, account- and source-keyed throttling, customer-scoped CSRF; server-validated cart (ids and quantities only, prices recomputed); checkout form with address and contact capture; order creation in a single transaction with an idempotency key; order confirmation; the existing inert demo checkout replaced. **No stock decrement, reservation or inventory movement is written** (ADR 0013).
- **Dependencies:** Phase 14 (complete locally - the storefront reads the authoritative database catalog); Phase 10 state machine; **D17 - settled in ADR 0012** (first-party customer sessions); and the **ordering gate - settled in ADR 0013** (availability is the only gate; no reservation, allocation or deduction). Both decisions that previously blocked this phase are recorded, and the phase was **implemented locally under explicit owner authorization (2026-10-15)**. **Not implemented, and not claimed:** the owner-operated customer credential reset (ADR 0012 records it as the alternative to self-service recovery; no owner-facing reset flow exists yet), an owner-facing customer-ban control, and any payment or delivery step.
- **Acceptance:** a client-submitted price is ignored and totals are recomputed server-side; a repeated submission with the same idempotency key returns the original order and creates no duplicate; a failed transaction leaves no partial order; a banned customer is refused **inside the order transaction** (D20); an out-of-stock product is refused from database state alone. **There is no oversell guarantee:** under ADR 0013 a binary availability gate cannot adjudicate the last unit, so that criterion is deliberately **not** claimed and the risk is owned operationally.
- **Verification gate (executed 2026-10-15):** `test` **109/109** (unit: cart and contact parsing, payment-method allowlist, submission fingerprint, email/name/password parsing, customer return paths); `test:db` **165/165**, including 10 customer-authentication tests (scrypt at rest, token digest only, generic failure, throttling, ban + audit, no audit row for a customer action) and 11 order-creation tests (database pricing, frozen line price, quantity clamp, out-of-stock and unpublished refusal, banned refusal, idempotent replay, key conflict, cross-customer key, COD state, atomic refusal, customer-scoped reads); `verify:storefront` runs **65/65** browser checks plus **16/16** HTTP flow checks against the served build (anonymous checkout redirect, cross-origin registration refused, cookie flags, no-CSRF order refused and nothing written, no price field in the form, forged `priceMinor`/`totalMinor` ignored, idempotent replay, another customer's order 404, banned customer refused with the session refused); `verify:admin` **97/97**; plus `typecheck`, `lint` (0 errors), `check:i18n`, `check:catalog`, `check:secrets`, `db:rehearsal` and `build`.
- **Risks:** duplicate orders from retries; **overselling the last unit, accepted by the owner (ADR 0013) and managed operationally**; customer PII in scope for the first time (retention, safe logging, the owner-operated reset).
- **Deliverables note:** checkout is reachable only to an authenticated customer (D12). A guest who proceeds to checkout is routed through login/registration with the cart preserved. **There is no self-service password recovery at launch** (ADR 0012): the interface must state the gap rather than offer a reset that does not exist, and the documented path is an owner-operated reset with one-time credentials, audit logging and session revocation. **Out of scope:** real payment capture, courier booking, refunds, and any external authentication or mail provider.

### Phase 16 - manual payment verification, shipping and order lifecycle (implemented in part, then superseded)

- **Decision record:** **ADR 0014** (`docs/decisions/0014-phase-16-checkout-payment-and-delivery-decisions.md`).
- **What was built (16A, 16B, 16C):** the prepaid claim write inside the order transaction; the owner
  verification queue with verify/hold/reject/false-claim; duplicate-reference flagging; the owner
  payment-recipient configuration screen and its `payment.recipient_manage` permission; the COD
  confirmation queue; the customer suspension control. Local only, never deployed.
- **Status: superseded by Phase 17 (ADR 0015).** The owner decided this release supports **Cash on
  Delivery only**, so the prepaid half - recipient configuration, claims, verification, holds, duplicate
  references, the `payment.*` permissions and every prepaid screen and translation - was **removed**
  from the application. **The COD half is retained unchanged.** The prepaid work is recorded here as
  history, not as a deliverable to finish.
- **Deliberately never built, and still not built:** delivery charges (owner values and a per-area
  migration are missing), courier/consignment recording, refund and return workflows, expiry (deferred
  by ADR 0014), and external notifications.
- **Owner decisions still open from ADR 0014:** real delivery prices and supported areas, the
  area-matching/fallback policy, the COD failed-delivery/retry detail, and what evidence and cadence a
  cash reconciliation requires.

### Phase 16b - automated payment gateway (deferred; not scheduled, not authorized)

Not part of this release. **No provider is selected** and none should be inferred. When the owner
approves a specific gateway, that decision must state the provider, fees, settlement timing,
refund/dispute handling and implementation scope, and the work must be a server-verified integration
writing its own payment record and audit trail - **not** a revival of the retired manual claim flow and
not a speculative abstraction built in advance.

### Phase 17 - COD-only transition, documentation reset and codebase audit (complete - local only)

- **Objective:** make the shipped product match what the store actually does, remove the manual prepaid
  subsystem without destroying history, and establish a reliable baseline for the dashboard redesign.
- **Status: complete (2026-10-17), local only.** Recorded in **ADR 0015**. No migration: the schema stays
  at **40 tables**.
- **Delivered:**
  - **Cash on Delivery is the only active payment method.** `createOrder` no longer accepts a payment
    method; it writes `cod` / `not_applicable` / `cod_pending_approval` with no expiry. Checkout submits
    no method field, so no page or request can choose a prepaid method.
  - **Removed:** the bKash/Nagad checkout branch and claim fields; `/admin/payments` (verification
    queue), `/admin/payments/recipients` (recipient configuration), `/api/admin/payments` and
    `/api/admin/payment-recipients`; the payment-recipient service and validation modules;
    `decideVerification` and the prepaid queue reads; the `payment.verify`, `payment.reject`,
    `payment.flag_false` and `payment.recipient_manage` permissions; their audit action codes; the
    prepaid translation keys; and the tests and verification checks that exercised them. Retired paths
    **404**.
  - **Retained deliberately:** the COD queue and its decisions, the customer suspension control, the ban
    enforcement, the audit trail, the COD order-page copy, and the historical death of nothing -
    `payment_recipient`, `payment_claim` and the prepaid state values stay in the schema **unused**,
    because they hold claim history and audit references (ADR 0015 section 3).
  - **Documentation reset:** requirements, roadmap, payment workflow, data model, security, dashboard and
    status documents reconciled to the COD-only product; contradictions about prepaid support removed.
  - **Dashboard preparation:** a design brief and prioritised feature list in `docs/admin-dashboard.md`,
    grounded in the codebase audit rather than in a mockup.
- **Verification (executed 2026-10-17, disposable local clusters and a real production build):** see
  `docs/project-status.md` for the exact counts - unit and database suites, `verify:admin` (including
  owner COD approve/reject over HTTP with a limited principal refused), `verify:storefront` browser
  suite plus the HTTP customer flow (COD order placed, stored as COD with no expiry, confirmation names
  cash on delivery), `typecheck`, `lint`, `check:catalog`, `check:i18n`, `check:secrets`,
  `db:check`, `db:rehearsal` and `build`.
- **Explicitly not done:** no gateway, no provider, no credential; no delivery charges; no courier
  integration; no refund/return screens; no analytics; **no dashboard redesign** (Phase 18); no schema
  cleanup that would destroy data; no provisioning, deployment or DNS change.
- **Known limits:** a customer who cannot pay cash on delivery cannot order at all; a refused parcel is
  handled operationally; the retained payment tables will need an owner-approved retention decision if
  they are ever dropped; and the admin surface is functional but has had no dedicated UX pass.

### Phase 18 - admin dashboard UX and design system application (complete - local only)

- **Objective:** redesign the owner panel for the work the owner actually does every day - COD decisions,
  catalog and availability maintenance, order and customer lookup - using the existing design system and
  the brief in `docs/admin-dashboard.md`.
- **Prerequisites:** Phase 17 verified (done); an owner decision on the dashboard's daily priority order
  if it differs from the brief; explicit authorization to begin.
- **Scope (from the brief):** an operational overview that answers "what needs me now"; one unified order
  surface with status filters and the COD decision inline; catalog/availability management with clear
  state and save feedback; customer history with ban controls and safeguards; consistent empty, loading
  and error states; safe destructive actions; responsive behaviour down to a phone; reusable components
  and tokens rather than page-specific CSS.
- **Explicitly not in scope:** new business policy, delivery-charge configuration (needs owner values and
  a migration), analytics that the data cannot support, a chart library, or any payment feature.
- **Acceptance:** every existing admin route keeps its server-side permission check and behaviour; no
  capability is added by moving a control; the browser suite is extended to cover the redesigned routes;
  keyboard and focus behaviour is verified; and no fabricated metric appears anywhere.
- **Verification gate:** `verify:admin` extended for the new UI, the browser suite re-run, plus
  typecheck/lint/i18n/build.
- **Status (2026-10-19): complete locally, not deployed.** The panel was rebuilt around the COD
  worklist: a dark grouped rail (desktop) that becomes a focus-trapped drawer (mobile), a page-header
  system, order cards with age, items, `tel:` contact and an inline approval (prefilled audit note) or a
  confirmed rejection with a required reason, a server-filtered queue with waiting/decided-today tabs and
  order search, product search plus an In Stock / Out of Stock switch, a customer detail page with
  recorded orders and a guarded suspension, and consistent notice/empty/error states. `verify:admin`
  grew to **119/119**, including real Chromium checks for the shell, drawer focus handling, 360px
  overflow, the rejection dialog and an inline approval that decides the order. Schema unchanged (40
  tables, no migration); no permission, state machine or total changed. **Deliberately not done:** a
  route-level `loading.tsx` was rejected because streaming turns a refused admin page into a 200 shell
  before the guard's redirect; action buttons carry pending states instead. No dispatch, refund,
  collection/reconciliation or analytics surface was invented.

### Phase 19 - operational readiness and storefront completion (after Phase 18)

- **Objective:** close the launch-critical gaps the Phase 17 audit found, in priority order.
- **Content, priority order to be confirmed by the owner:**
  1. **Delivery-charge configuration** - blocked on owner values and one new migration (areas plus a
     site-wide default, snapshotted onto `order.shipping_minor`).
  2. **Order and customer management depth** - an owner-visible order detail surface beyond the COD
     queue, cancellation recording, and the owner-operated customer credential reset. **Refund recording
     is deferred by owner decision (2026-10-20) and is not in scope.**
  3. **Catalog completeness** - multiple images per product, variant editing only if the real catalog
     needs it, and a documented answer on image rights.
  4. **Storefront polish** - empty/loading/error states, mobile usability, and honest copy audits.
  5. **Security and operations** - the open requirements in `docs/security.md`, dependency review,
     privacy/retention decisions, backups with a tested restore, and monitoring.
  6. **Deployment readiness** - environment separation, secrets, TLS, headers, and a rollback rehearsal.
- **Explicitly not in scope:** deployment itself, DNS changes, and any provider onboarding - each needs
  its own written authorization.

### Phase 20 - deployment and handoff (blocked on Phase 19)

- **Objective:** release through an owner-approved, reversible deployment with a named operational owner.
- **Acceptance:** smoke checks pass, alert/restore/rollback drills succeed, indexability reflects the
  owner's launch intent (the site is currently `noindex`), and handoff documentation exists.
- **Blocked by:** Phase 19 acceptance, provisioning authorization, image rights, and a launch decision.

## Parallel work that does not block the critical path

| Work | Can start | Why it is safe in parallel |
| --- | --- | --- |
| Real iOS/Android, screen-reader and 200% zoom checks | Now | Acceptance evidence for the current build; no backend dependency |
| Bangla content review of product names and copy | Now | Content task, independent of code |
| Image rights clearance | Now | Business task; gates launch and any imagery expansion |
| Delivery amounts for the three areas | Now | Owner input; configuration exists, but the store cannot trade until the default is set |
| Catalog migration tooling design | During Phase 18 | Needs the Phase 13 read layer, not the dashboard UI |

Deliberately **not** parallelised: schema changes (each needs its own approval and rehearsal) and any
payment work (no provider is authorized).

## Frontend-demo milestones versus production-launch requirements

**Demo milestones:** complete through Phase 5, with device and content checks outstanding on an
explicitly `noindex` build.

**Production-launch requirements:** a real database, real orders, a COD fulfilment workflow, delivery
charges, customer-data protection and operational readiness. The database, catalog, customer accounts and
order creation exist **locally**; everything else is Phase 19 or later. **Nothing is deployed.**

A passing storefront check says nothing about production commerce readiness.

## Critical path and risks

`Phases 0-9 complete -> Phase 10 design -> Phase 11 database foundation -> Phase 12 owner auth -> Phase 13
catalog management -> Phase 14 storefront cutover -> Phase 15 customer accounts and order creation ->
Phase 16 COD fulfilment (prepaid half superseded) -> Phase 17 COD-only baseline -> Phase 18 admin
dashboard UX (complete locally) -> Phase 19 operational readiness -> Phase 20 deployment.`

**Where the project actually stands:** Phases 11-19 are implemented **locally**. The commerce loop is
COD-only and works end to end in a local build, with delivery priced from owner configuration (ADR
0016). The remaining gaps are **owner inputs** (the actual delivery amounts, failed-delivery handling,
retention, image rights) and **product work** (order depth and operational readiness), not undecided
architecture.

**Risks:** COD refusal at the door is now the only payment failure mode and is handled operationally;
overselling is accepted (ADR 0013); the retained payment tables carry history that a future cleanup must
not silently destroy. The admin surface is a coherent operations panel and the checkout prices delivery;
what it still lacks is operational depth (dispatch, cash collection/reconciliation), which is the rest
of Phase 19. **Refunds are out of scope for this launch by owner decision (2026-10-20)** and are not part
of Phase 19.

**No production launch date is promised.**

## Phase 19, first slice - delivered 2026-10-20

**Three-area delivery charges are implemented locally and verified.** Customers choose **Dhaka**,
**Chattogram** or **Other districts**; the owner configures one required default and two optional
overrides at **Settings → Delivery charges**. The server resolves the charge inside the order
transaction, refuses an unconfigured default, and snapshots the area and amount. ADR 0016 records the
decision. Migration `0004_district_delivery_charges` adds two tables and a nullable
`order_contact.district_code`; historical orders are untouched.

**Still an owner input:** the actual BDT amounts. Until the default is saved, checkout correctly refuses
every order. No price was guessed.

## Phase 20, first slice - delivered 2026-10-20

**Launch-readiness sprint: the owner can now read an order, and the lists are honest about their size.**

Delivered:

1. **Order detail** (`/admin/orders/[orderNumber]`, requires `order.read`): reference and placement time,
   customer and delivery contact with a `tel:` link, the delivery area and address, the recorded lines
   with their saved unit prices, the delivery-charge snapshot, the order and COD states, the order event
   log, and - only with `audit.read` - the audit trail. The approve/reject controls are the same guarded
   forms the queue posts to, so there is one implementation of a decision.
2. **Order history** (`/admin/orders`): server-side search (number, name, phone), status filter, and
   pagination with an exact total. The queue and the customer list are paginated the same way, and a
   capped customer order list now says how many orders exist beyond it.
3. **Storefront availability**: an Out of Stock card badge, a product page that states its state instead
   of offering an add-to-cart control, marked unavailable cart lines, and a checkout that refuses to
   submit while one is present. All of it is presentation over the unchanged server gate.
4. **Reproducible local start**: `npm run dev:db` plus `.env.local`-aware database scripts.
5. **One defect found by verification and fixed**: the order detail withheld the customer email from the
   page but still serialized it into the React Server Component payload, so it reached the browser
   anyway. The page now omits it entirely unless the principal holds `customer.read`.

**No migration. No new order state, transition or business policy.** The schema stays at 42 tables.

## Phase 20, second slice - delivered 2026-10-20

**The post-approval COD lifecycle is implemented locally.** The order detail is now a workspace, not
just a record:

| Step | From | To | Guard | Event |
| --- | --- | --- | --- | --- |
| Dispatch | `confirmed`/`processing` + `cod_approved` | `shipped` | Owner has approved; payment verified for legacy prepaid | `order_shipped` |
| Delivered | `shipped` + `cod_approved` | `delivered` | Dispatched, cash still owed | `order_delivered` |
| Failed delivery | `shipped` + `cod_approved` | `cod_failed` (status stays `shipped`) | Dispatched; reason required; creates one `customer_return` per line | `cod_failed` |
| Parcel received | `shipped` + `cod_failed` | `returned`; returns → `received` | A return is live for the order | `return_received` |
| Inspect | `received` | `inspected_accepted` / `inspected_rejected` | Note required to reject; **no movement, no availability change** | `return_inspected` |
| Cash collected | `cod_approved` + `confirmed`/`processing`/`shipped`/`delivered` | `cod_collected` | Owner's explicit act, never inferred | `cod_collected` |
| Complete | `delivered` + `cod_collected`/`cod_failed` | `completed` | A recorded outcome exists | `order_completed` |
| Cancel | `pending`/`confirmed`/`processing` | `cancelled` | Not yet dispatched; reason required | `order_cancelled` |

Every row is one guarded `UPDATE ... WHERE <current state>`, so a repeat is a conflict rather than a
second effect; each writes its order event (unique key) and audit record in the caller's transaction;
each re-checks its own permission in the service, not only in the route. `order.dispatch` is new;
`cod.confirm_collection` and `return.inspect` gained the workflows they were catalogued for.

**Deliberately absent:** reconciliation (`cod_reconciled` is written by nothing), failed-delivery charge
liability, refund recording (**deferred by owner decision, 2026-10-20**), any automatic
retry/cancel/reship, and any stock effect from inspection. **No
migration:** the schema already held every column, state and return table this needed.

## Phase 21 - COD workflow corrected, delivered 2026-10-20

**A courier-statement reconciliation phase was proposed and is withdrawn.** It rested on an
assumption the owner corrected: QueenBee's has **no courier statement, no settlement period, no
statement import or matching and no courier reconciliation**. The confirmed workflow is shorter than
what had been built:

> customer places a COD order → owner approves → dispatch → delivery → **the owner manually marks the
> order Payment Received** → the order is **Completed** and its revenue reaches the dashboard.

Two things were wrong against that workflow, and both are now fixed:

1. **Payment receipt and completion were two separate owner actions**, and receipt was allowed before
   dispatch. They are one action now: `markPaymentReceived` records `cod_state = cod_collected` and
   `status = completed` in one transaction, reachable only from `shipped` or `delivered`.
2. **The dashboard reported no revenue at all**, because no figure had been substantiated. Revenue is
   now derived from `order.total_minor` over orders that are **completed and paid**, summed on every
   read from immutable rows - so there is no counter to double-count and a repeat submission cannot
   move it.

**Unchanged:** no schema change, no migration, no new table. `cod_reconciled` stays written by
nothing. Delivery and dispatch still record position only, never money. A failed delivery adds no
charge to the customer's total - the owner bears it, and the order keeps exactly the amounts it was
placed with.

**Removed from the roadmap:** the courier-statement reconciliation phase, its settlement-period,
statement-matching and discrepancy rules, and the `0005` migration that was proposed for it. The
`operational_exception` table keeps its `unreconciled_collection` type as unused schema, exactly as
the reservation tables are retained.

## Phase 22 - payment receipt with per-order courier costs, delivered 2026-10-20

**The owner's actual money workflow is now implemented.** Customer pays the courier the price plus the
delivery fee; the courier keeps its standard fee; the owner checks the courier's dashboard and marks the
order **Payment Received**; at that moment the owner may record any **additional courier cost** for that
order; the order completes and the dashboard's figures update.

| Piece | Where |
| --- | --- |
| `order_additional_cost` table, immutability + no-delete triggers | **migration `0005`** (additive; schema 42 → **43** tables) |
| Record / void costs, parse amounts | `src/server/orders/costs.ts` |
| Costs saved atomically with receipt and completion | `markPaymentReceived` |
| Cost route | `POST /api/admin/orders/cost` |
| Permission | `order.cost_record` (privileged) |
| Audit actions | `order.cost_recorded`, `order.cost_voided` |
| Dashboard figures | `revenueSummary` → four separate amounts |

**Four amounts, never collapsed:** customer payment (gross), standard delivery fee (inside it, kept by
the courier), additional courier costs, and **estimated** net proceeds. The fee is subtracted **once**;
additional costs are subtracted after it; the net figure reads **Unavailable** when an order cannot
substantiate the split. Nothing is incremented - every figure is derived on read.

**Unchanged:** no courier integration, consignment reference, tracking, statement import or automated
reconciliation; no inventory or delivery-policy change; the customer's charged total cannot be altered by
a cost, and `order_immutable_columns` would refuse it. **Refunds were proposed as the next phase here and
are deferred by owner decision** - see the section below.

**Superseded:** the recommendation that closed this phase named refund recording as the next best step.
**The owner deferred refunds entirely (2026-10-20)**; the current recommendation is below.

## Refunds - deferred by owner decision, out of scope for the current launch (2026-10-20)

**The owner decided refunds are skipped completely for now.** This supersedes the Phase 22
recommendation, which proposed refund recording as the next phase. Refunds are **not** the next phase,
are **not** scheduled, and are **not** a launch requirement.

What this changes:

- **No refund feature is to be built** - no screen, service, route, permission, transition or accounting
  logic. Any future refund work needs a **new explicit owner decision**, not a roadmap slot.
- **The existing refund schema stays exactly as it is.** `refund` and its four states
  (`requested`/`processing`/`completed`/`failed`) remain in the schema, unused, written by nothing.
  Nothing is dropped, no migration runs, and no historical record is touched - the same retention rule
  already applied to the reservation, claim and `operational_exception` tables.
- **The standing prohibitions are unchanged.** `order.status`, `cod_state`, the refund state and the
  reservation state stay four separate concepts, and a refund is never reported completed because it was
  requested or approved (AGENTS.md). Those rules bind any future work; they are not a plan to do it now.
- **What the owner does instead, in practice:** a refund is settled **outside the platform**, as a manual
  money movement. The platform therefore **cannot** state that a refund was made. It must not imply one:
  no screen, notice or dashboard figure may claim a refund occurred, and the refund figure never appears
  in a revenue total because nothing writes it.

**Recorded in:** this section, `docs/project-status.md` (decision register row and the deferred list),
and `AGENTS.md`. **No ADR was written**, because this is a scope decision that adds no architecture.

## Phase 23 - owner-operated customer credential reset, delivered 2026-10-20

**The last launch blocker is closed.** Customer authentication has no self-service recovery and no
authorized mail/SMS provider (D17, ADR 0012), so before this phase a customer who forgot a password was
permanently locked out and the owner had no remedy. ADR 0012 named the alternative; this phase built it.

| Piece | Where |
| --- | --- |
| Issue + redeem, digest-only, atomic | `src/server/customer-auth/recovery.ts` |
| Owner route | `POST /api/admin/customers/recovery` |
| Flash dismissal | `POST /api/admin/customers/recovery/dismiss` |
| Customer redemption | `/account/recover` + `POST /api/account/recover` |
| Permission | `customer.credential_reset` (**privileged**) |
| Audit | `customer.credential_reset_issued`, `customer.recovery_refused`, `customer.credential_reset_redeemed` |
| Expiry policy | `RECOVERY_TOKEN_MS` = **30 minutes** (ADR 0019 §4) |

**Rules, each enforced twice where it matters:** a 256-bit credential stored only as a SHA-256 digest;
single use, consumed by a guarded `UPDATE ... WHERE used_at IS NULL`; superseded by the partial unique
index; **every live session revoked at issuance and at redemption**; redemption **forces a new password**;
a **suspended or deleted account refused with one indistinguishable outcome**; source-throttled; every
failure generic. **No migration** - `account_recovery_token` was already designed for this.

**A real defect found and fixed:** the admin flash cookie was documented "read once, then gone" but only
ever read, so **every reload re-displayed the one-time token**. A page render cannot clear a cookie in this
version of Next.js (it threw a 500), so the clear is a route that overwrites the cookie empty **with the
same `path`**. The Chromium check that reloads after dismissal is what caught it.

**Not built:** no email, SMS, OAuth or external provider; no customer-triggered recovery request; no
password-history or force-expiry policy; no refund work (deferred).

## Phase 26 - three recently added products on the homepage, delivered 2026-10-20

**The owner reversed the earlier "no recency" direction.** D6 previously read "Replaced, not shown" because
no reliable date field was believed to exist. That belief was wrong about the schema: `product.created_at`
has been a `NOT NULL` column with `defaultNow()` since Phase 11, and `product_category_published_idx`
already indexes `created_at desc`. What was actually missing was (a) exposure through the catalog contract,
(b) any ordering that used it, and (c) distinct seed timestamps. **No migration was required and none was
created.**

| Piece | Where |
| --- | --- |
| Timestamp on the contract | `CatalogProduct.createdAt` (`src/server/catalog/read.ts`), `CatalogItem.createdAt` (`src/lib/types.ts`) |
| Ordering | `listPublishedProducts`: `created_at desc, id desc` |
| Selection | `selectRecentlyAdded` in `HomeSections.tsx`, cap `RECENT_LIMIT = 3` |
| Seed timestamps | `seededProductTimestamp(index)` - distinct, one hour apart, in fixture order |
| Copy | `home.recentTitle` / `home.recentBody` / `home.recentBodyPartial` in both locales |

**The ordering is `product.created_at desc` with `product.id desc` as the tie-breaker.** The secondary key
is load-bearing: products created in one transaction can share a microsecond, and without a total order the
"three newest" would depend on planner output and could change between identical requests. `created_at` is
deliberately **not** `published_at` - publishing is repeatable, so a long-staged product published today would
jump to the front of a list it does not belong in.

**Partial and empty states are honest.** `createdAt` is `null` for the fixture, which carries no capture
dates, so a fixture-backed catalog shows its gap rather than an invented order. Below three dated products the
body text states the real count; at zero the section is omitted entirely. The row is never padded with a
repeated or fabricated card. The selection is re-sorted in the view rather than trusting query order, so an
unordered caller still gets a correct result.

**Unchanged:** catalog listing order and behaviour (the catalog view sorts for itself), cart behaviour, the
featured shelf and offer row, and the visual identity. The section reuses `ProductGrid`/`ProductCard`, the
tokens, and `ProductPhoto` for imagery.

**Verified 2026-10-20:** unit `140/140`, db `234/234` plus the new recency cases, `verify:storefront`
browser + HTTP flow, `verify:admin`, `typecheck`, `lint`, `check:i18n` (849 keys), `check:catalog`,
`check:secrets`, `next build`. Screenshots inspected in both locales at desktop and mobile widths.

**Not built:** no `published_at`-based "new arrivals", no date shown on the card or product page (the
timestamp orders the section; it is not published as a date), no admin control for recency, and no change to
curated selections.

### Phase 26 revision - hero images follow recency, featured shelf follows the grid (not yet committed)

Owner decision: the **three product photographs beside the hero headline are the three most recently
added products**, newest first. The decision extends D6 to the hero **only**; the "Recently added"
section keeps its own selection, count and layout.

| Piece | Where |
| --- | --- |
| Shared ordering | `selectNewestProducts` in `src/features/catalog/recent.ts` - one rule behind both surfaces |
| Hero selection | `selectHeroProducts(products)` - newest first, skips a product with no photograph |
| Hero wiring | `HomeSections.tsx`; the hand-picked `HERO_SLUGS` list is gone |
| Shelf scale | `FeaturedShelf.module.css` - track width and gap derived at `ProductGrid`'s own breakpoints |

**No migration and no schema change.** The timestamp source is the same `product.created_at` column the
section already reads (`NOT NULL`, `defaultNow()`, indexed by `product_category_published_idx`), ordered
`created_at desc, id desc`.

**Why the hero changed.** A slug constant is curation presented as a product edit: it silently stopped
being "the newest" the moment the catalog moved. The hero now inherits recency from the data, and the
collage keeps its composition, positioning, links and responsive behaviour - only the selection changed.

**Why the shelf changed.** The Featured shelf derived its own column widths at its own breakpoints
(2 / 3 / 4, with the wider gap from 1024px), so at 1440px it showed four cards of ~442px beside a
standard grid that fits five of ~253px. It now uses the full grid's own breakpoints - 2 / 3 / 4 / 5 at
720 / 1280 / 1440px with the gap widening at 1280px - so a featured card and a card in the offer row
below are the same width at every viewport. Six featured products still overflow at 1440px, so the
controls keep their job. **Five columns is a wide-desktop layout rule, not a promise to publish five
products.**

**Fairness note:** the hero and the "Recently added" section now show the same three products by
construction. That is the approved behaviour - both surfaces make the same factual claim - and the hero
adds no card, title, price or text, so it does not read as a second copy of the row.

**Revision 2 - "Recently added" uses the standard grid.** The section had been given a `trio` density so
its three cards filled their own row; the effect was three cards wider than every other card on the page,
which is the same defect the shelf had. The density is **removed** (`ProductGrid` now offers `full` and
`sidebar` only) and the row uses the standard full-width grid, so its column count and card width match the
offer row at every viewport: 2 / 3 / 3 / 4 / 5 columns at 320 / 768 / 1024 / 1280 / 1440px, with cards
136 / 233 / 309 / 282 / 253px measured against the same 136 / 233 / 309 / 282 / 253px standard cards.

**The selection stays three products, and that is a deliberate limit, not an oversight.** `RECENT_LIMIT` and
the section's body copy ("the three products most recently added") come from D6, not from the hero; the hero's
three images are a separate feature with its own composition. At 1440px the row therefore fills three of five
columns and leaves two empty. Stretching the cards to fill the row is what caused the defect being fixed, and
padding the row with invented or repeated cards is forbidden. **Showing more than three would change the
published requirement (D6) and the section's copy - an owner decision, one constant plus two dictionary
strings, not a layout tweak.**

## Phase 27 - admin control-scale and feedback consistency, delivered 2026-10-21

**One control scale, and copy that matches behaviour.** Phase 24 measured controls at 32/34/36/40/51px,
an approve (40px) / reject (34px) pair inside one decision, a 34px submit button beside a 40px search
field, and an audit note labelled *(optional)* that the server refuses without. None of it needed a
policy change.

| Piece | Where |
| --- | --- |
| Scale tokens | `--admin-control` (40) and `--admin-control-sm` (34) in `admin.module.css` |
| Destructive trigger | `ConfirmSubmit` now defaults to the standard height |
| Toolbar row | small buttons inside `.toolbar`, and `.filterTab`, take the standard height |
| Touch widths | below 720px the small variant grows to 40px |
| Note field | `admin.cod.noteSummary` says *required, at least 10 characters* in both locales; the field renders open |
| Storefront press state | `scale(0.97)` on the primary and add-to-cart actions, matching the admin button |

**Verified 2026-10-21:** `verify:admin` **152/152** (two new checks: a computed-height sweep over four
admin pages that fails on anything but 34/40, and accept/reject parity plus the visible, correctly
labelled required note), `verify:storefront` **101/101** + **27/27** HTTP, unit **156/156**, `test:db`
**241/241**, `typecheck`, `eslint` 0 errors, `check:i18n` (849 keys), `check:catalog`, `check:secrets`,
`next build`. Screenshots inspected: dashboard, delivery settings, order operations.

**Not done, and why:** the 8 status tabs on `/admin/orders` are kept - collapsing them changes which
filters an owner can reach, and no evidence says which two they use; the `?notice=` parameter still
survives a reload, because clearing it in the client would race the existing navigation assertions; the
recovery screen still has no contact route, because the store's phone number is owner-supplied data that
does not exist in the repository.

## Phase 28 - English-only interface and an owner-editable announcement bar, delivered 2026-10-21

**One interface language.** The owner made QueenBee's English only: the toggle, the locale store, the
provider and the 845-key Bangla half of the dictionary are gone. The type is narrowed to `Locale = 'en'`, so
a Bangla interface is now a compile error rather than a configuration mistake. Nothing reads a stored
preference any more, which is what makes "refresh, navigate, sign in, sign out" unable to restore Bangla.

| Piece | Where |
| --- | --- |
| Dictionary | `src/i18n/dictionaries.ts` - English only, one object |
| Translator | `src/i18n/useTranslation.ts` - plain lookup, no context, `locale` fixed to `'en'` |
| Removed | `LanguageToggle`, `LocaleProvider`, `locale-store`, the four language-toggle keys and their CSS |
| Money | `formatMoney(minor)` - `Tk 1,150`, no locale argument |
| Delivery areas | one English `name` per area instead of `nameEn`/`nameBn` |
| Document | `html lang="en"`, English metadata; the Bengali font stays for Bengali *data* |
| Check | `npm run check:i18n` rewritten: completeness, no Bengali interface copy, referenced keys exist, no Bengali in application-owned code |

**"No Bengali in application-owned code" is the load-bearing assertion.** Catalog and seed files are
allowlisted because product, brand and category names are **records**; a code page, a form label, a
metadata title or an accessibility string carrying Bengali fails the check.

**Deliberately kept.** `name_bn` columns, Bengali product/category values, `LocalizedText`, the Bengali
font, and the search normaliser that strips Bengali vowel marks. The interface language changed; the
business records did not.

**The announcement bar is now editable** at **Settings -> Announcement bar** (`settings.write`, owner-level).
It is stored in the existing `store_setting` table as two typed rows - `announcement.message` (text) and
`announcement.visible` (boolean) - so this needed **no schema change and no migration**; the table's key
format check, value-type check and `updated_by_staff_id` already fit. The write and its
`settings.announcement_updated` audit record commit together. The **locked preview notice is not
editable**: it stays in `src/data/announcements.ts`, is composed first on the server, and the owner's line
can only be added beside it. An empty message is stored as empty and forced hidden - the bar is never a
blank strip.

**Verified 2026-10-21:** see the phase 28 verification block recorded in `docs/project-status.md`; the
suite totals for the final committed tree are reported in the phase 28 summary rather than guessed here.


## Phase 29 - Zatiq Easy admin reference audit and feature-parity specification (research only, 2026-10-21)

**A read-only audit of the reference merchant dashboard, and nothing else.** The owner supplied an
authorized session; the panel was inspected in Chromium at 1440x900 plus four other widths, and **no
write, upload, create, edit or delete was performed** against the reference store. No QueenBee's
application code, schema, migration, dependency, environment file or runtime configuration changed.

| Deliverable | Where |
| --- | --- |
| Feature inventory, behavioural findings, exclusions | `docs/reference/zatiq-easy-admin-audit.md` |
| Measured visual specification (geometry, type, controls, states) | `docs/reference/zatiq-easy-admin-visual-spec.md` |
| Field-by-field data-model mapping, parity matrix, phased roadmap | `docs/reference/zatiq-easy-admin-parity.md` |

**What was inspected in depth:** the shell and five-group navigation, the dashboard (five KPIs, revenue
chart, orders-by-status, recent orders, low stock, top selling, quick actions), the orders list and a full
order detail (line items, summary, delivery, notes, the 10-value status dropdown, customer block, fraud
flag), the products list, product create and product edit (all eight sections and every field), the
categories list, the Create Category modal (both upload slots, limits, footer, empty-submit behaviour),
the subcategory page, the customers list (columns, search, column chooser, row anatomy), a customer
detail (devices/IP section, empty states), the analytics report, Users & Permissions, and Promo Codes.

**The findings that matter for QueenBee's** are recorded with evidence rather than impressions: the
reference mixes fulfilment and payment states in one dropdown; it lets a placed order's line-item prices
be edited; it validates with native browser bubbles and has no `role="dialog"` on its modal; it renders
three different order counts in one session; it shows a numeric stock column, which QueenBee's does not
have by decision (ADR 0013); it collapses its rail at 768 px rather than 1024 px; and it uses three table
row heights (48/53/57) and two button heights (36/40) where QueenBee's has one control scale. Each is
marked **copy the idea**, **adapt**, or **refuse**.

**Seventeen exclusion groups are written down explicitly** so they cannot leak back in: courier, Manage
Shop, Themes, Theme Builder, Landing Pages, Mobile App, Spotlights, Abandoned Cart (excluded even though
it is in the navigation), Zatiq Experts, the whole ZatiqGO section, the vendor resource links, all
subscription and plan UI, vendor marketing, stock quantity and the other reference-only product fields,
promo codes, staff roles and role management, the public receipt URL, and raw device/IP display.

**Nothing was approved and no code was written.** Nine owner decisions are named as prerequisites for any
future parity work - category images and their storage, product short/SEO descriptions, variant depth,
product spec fields, an internal order note, receipt printing, customer export, whether top-selling counts
may be published, and promo codes. The roadmap proposes Phases 30-34 and states, for each, its scope,
exclusions, prerequisites, likely files, tests, acceptance criteria and risks.

**Reference credentials were held only in `/tmp/zq/cred.json`, outside the repository,** and are in no
tracked file, log or commit. Screenshots stay in `/tmp/zq/shots/` and are **not committed** because they
contain third-party customer names, phone numbers and addresses.

**Not inspected, and why:** no excluded module's internals; no create/edit/delete anywhere (a read-only
audit must not mutate a live store); image-upload rejection behaviour (would require uploading a file to
a third-party store); the export file format (the download did not materialise in the automated context);
the Add User dialog (it did not open in this session); and no accessibility conformance claim, because
the reference's own gaps are recorded rather than adopted.

## Phase 30 - admin list-surface parity (delivered 2026-10-21)

**The owner approved Phase 30, and it is implemented locally.** Every admin list now shares one toolbar,
one control scale, one row anatomy and one footer: filter first, then search, then the date range, with
the count stated **once** in the footer. Nothing about the business rules, permissions, state machines,
totals or audit contract changed, and there is **no schema change and no migration**.

**What was aligned:**

| Surface | What changed |
| --- | --- |
| `/admin/orders` | server-side **date range** (`from`/`to`), page-size control, delivery sub-line and line count per row, active-filter chips |
| `/admin/orders-cod` | **both tabs now paginate** (the waiting queue used to render every waiting order at once), page-size control |
| `/admin/catalog` | **pagination with an exact total** (the footer previously reported only the rows on screen), page-size control |
| `/admin/categories` | **search, a visibility filter and pagination** - the list previously had none of the three |
| `/admin/customers` | page-size control; the footer is the single count |
| `/admin/audit` | **pagination with a real page size and an exact total**, replacing a fixed 100-row slice |

**The shared pieces** are `ListToolbar`, `ListSearch` and `FilterTabs` (`_ui/ListToolbar.tsx`),
`DateRangeFilter` and `ActiveFilters` (`_ui/ListFilters.tsx`), a rewritten `Pagination` with the page-size
control, and the pure query-state helpers in `src/lib/admin-query.ts`. Every list is filtered **in SQL**,
every state is in the URL, and every filter change drops the page number so a narrowed list starts at
page 1. Invalid parameters are clamped rather than refused: `?page=9999` resolves to the last page, an
undocumented page size falls back to the list default, and `2026-02-31` is ignored rather than rolling
into March.

**What was deliberately not done:** no new column, table, field, export, bulk action or owner-decision
item; no category images, no product form sectioning, no customer-detail expansion; no change to any
permission, transition, money figure or audit action. The parity document's status-C and status-E items
stay where they were.

**Verified 2026-10-21** against a disposable local cluster and a real production build: `verify:admin`
**172/172** (22 new checks, including the toolbar sweep, server-side search and no-results, combined
filters and chips, the date range, page size, out-of-range and invalid parameters, pagination on
catalog/categories/audit, footer alignment, and 320/360/390/768/1024/1280/1440/1920px containment);
`test` **165/165**; `test:db` **246/246**; plus `typecheck`, `lint`, `check:i18n`, `check:catalog`,
`check:secrets`, `build` and `verify:storefront`. **Screenshots were captured and visually inspected**;
two defects were found that way and fixed - the eight status tabs and the date row were clipped at 390px,
and the money cell's right alignment read as clipped once a row wrapped.

## Phase 31 - one level of subcategory management (delivered 2026-11-06)

**The owner authorized Phase 31.** The category editor offers a **Parent category** picker and the
service enforces a single level of depth. `category.parent_id` already existed, so this phase is
**application and presentation only - no schema change and no migration**.

**Rules, enforced in the service as well as offered by the form:**

| Rule | Behaviour |
| --- | --- |
| Parent must be a live root | a child cannot be a parent; no grandchildren |
| Not its own parent | refused before the schema's `category_not_own_parent` check |
| A category with live children stays top level | the editor states why and offers no picker; the service refuses too |
| A child may move back to the top level | explicit empty `parentId` |
| Archive | still refused while a live child exists; archive child, then parent |

**What changed:** `CategoryInput.parentId` and normalisation; create/update writes and audit; the admin
list's parent-aware order and **In &lt;parent&gt;** label; the editor's parent picker and locked state;
`CatalogCategory.parentId` and the storefront projection. The category index, homepage department rail,
header drawer and filter rail show **roots only**; a parent page shows its live children and includes
their products; a child breadcrumb names its parent; department counts include child products.

**Deliberately not built:** drag-reorder of categories, bulk move, deeper nesting, and category images
(already tracked separately in Phase 36).

**Verified 2026-11-06:** `typecheck`, `lint` (0 errors), `check:i18n`, `check:catalog`, unit
**212/212**, `tests/db/catalog.test.ts` **36/36**, `build`; a dev-server walk-through created a child
under Skincare, checked the parent's count/lock, moved it to top level and back, and verified the
storefront index/parent/child surfaces; `verify:admin` **202/205** with the three pre-existing failures
(category-visibility hydration race, Telegram removal-dialog flake, absent CSP); `verify:storefront`
**91/97** after a stale escaped regex that aborted the suite at check 26 was corrected, with the six
failures on untouched surfaces (8/32 product-page image and price, 20 gallery dots, 27d section link,
36d the seed's five departments, 40b favicon ink). Nothing is deployed.

## Phase 35 - Product editor (delivered 2026-10-21)

**The owner asked for the new-product screen to be rebuilt to match the reference, and it is.** The form
used to be a fieldset stack on the catalog list behind `?new=1`; it is now its own route,
`/admin/catalog/new`, with the edit form at `/admin/catalog/[productId]`. The list no longer hosts a form
at all, so a filtered, paginated list and a full-height editor stop sharing a URL.

**Owner decisions taken before the build** (asked, not assumed):

| Question | Decision |
| --- | --- |
| Copy depth | **Short description only.** The reference's SEO description was declined; it would be stored and never rendered, and no SEO surface exists. |
| Spec fields | **Neither.** Weight/dimensions matter only for courier booking (ADR 0017 excludes it), and free-form details duplicate the description. |
| Images | **Association + ordering.** No upload: object storage is not provisioned, and association-only imagery is an approved rule. |
| Variants | **One variant.** Price stays on the default variant, presented as a product-level field. |

**What the editor does:**

- **Two columns** - copy and media left, commercial facts right - with the **live storefront preview** at
  the top of the right column, and a **sticky action bar** so Save is never scrolled away from.
- **Sections** named for the task (General information, Media, Pricing, Organisation, Publication), each
  with a one-line explanation, rather than the reference's generic accordion.
- **A required summary that names the empty fields** ("Still required: Name (English), Category, Brand,
  Price") instead of an asterisk convention. Brand is included because the schema and the service both
  require it.
- **A live preview that never invents**: the typed name, pack size, price, comparison price, derived
  saving and shelf line, with "No price yet" while the price is empty. The saving is *derived* by the same
  `discountAmount`/`discountPercent` the storefront uses, and a comparison price that is not genuinely
  higher is called out before save.
- **A publication outcome sentence** stating what the two independent states mean together - live and
  orderable, live but not orderable, or hidden - instead of leaving the owner to reason about two toggles.
- **Real image ordering** on the edit screen: move up/down buttons writing a dense `sort_order` in one
  post, with the primary image kept a separate fact. Buttons rather than drag alone, because a drag-only
  control is unusable with a keyboard and on the phone the owner approves orders from.
- **Explicit validation.** `noValidate` hands the DOM constraints to the submit handler, which states the
  missing set in text, sets `aria-invalid`, and focuses the first offender. Native bubbles alone are
  silent for a keyboard user and leave no list.

**Schema: one additive column.** `product.short_description` (nullable, `CHECK` 1-500) in migration
`0006_product_short_description`; **tables unchanged at 43**. The storefront renders it under the price
and omits the paragraph entirely when it is null. One new audit action, `catalog.image_reordered`.

**Deliberately not done:** no SEO description, no weight/dimensions, no custom detail fields, no variant
matrix, no upload, no rich text, no duplicate-action chrome, and no change to any permission, price rule,
state machine or order path.

**Verified 2026-10-21** against a disposable local cluster and a real production build: `verify:admin`
**185/185** (11 new editor checks: route shape and section set, the required summary, the live preview
driven through the native value setter, the comparison-price warning, the slug preview, the publication
outcome, blocked-submit feedback, a real create through the form, the stored shelf line, and 320-1920px
containment with the preview first below 1100px); `test` **165/165**; `test:db` **246/246**; plus
`typecheck`, `lint`, `check:i18n`, `check:catalog`, `check:secrets`, `db:validate`, `db:check`,
`db:rehearsal`, `build` and `verify:storefront`. Screenshots at 1440 and 390px were captured and
inspected; **three defects were found that way and fixed** - a duplicated page heading, a second action
bar that overlaid the form, and a brand field missing from the required summary.

## Phase 37 - the storefront leaves demonstration (implemented locally, 2026-10-23)

**Owner directive.** Remove the demo notice completely, upgrade the storefront, centre the desktop
navigation, give the phone the same bottom-bar navigation the admin shell uses, redesign sign in /
registration / my account, and make homepage sections fill their rows. Recorded in **ADR 0020**.

**What changed**

- **The demo notice is gone.** `src/data/announcements.ts` is an empty typed list; the strip renders the
  owner's saved line only, with no "Demo"/"Info" badge, and is absent when that line is empty. The footer's
  demonstration sentence was removed too. `check:catalog` and `verify:browser` were **inverted, not
  deleted**, so a reintroduced demo notice is a failing test.
- **One navigation model per size.** The drawer is deleted. Below 1024px a fixed bottom tab bar carries
  Home / Shop / Categories / Cart / Account (64px targets, cart count, `aria-current`, safe-area inset,
  shell reserves its height). From 1024px the header's own centred navigation takes over.
- **`/categories` is a new route** with per-category product counts, because the bar's Categories tab
  needed a destination once the drawer was gone.
- **The desktop header is a `1fr auto 1fr` grid** so the links are centred in the viewport; search is a
  compact link between 1024 and 1199px and a real 240px field from 1200px.
- **The full-width grid is 2 columns on a phone and 3 from 880px**, and homepage sections publish six
  (offer row three), so every row is complete at both widths. `ProductGrid` measures its own child count
  and lets a lone last card span a phone row.
- **Sign in, registration and the one-time-code page share `AuthShell`**, a two-panel frame; the account
  page became a hub (orders, details, password route, session), and its signed-out state uses the same
  frame.
- **The catalog's filters are a disclosure on a phone** with an active-count badge, because the chips used
  to fill the whole first screen before a product appeared.

**Owner-requested admin fixes in the same change**

- **The money field's currency prefix no longer overlays the typed amount.** It was an absolutely
  positioned `BDT` over an input padded by one character; it is now a flex sibling with the border on the
  wrapper, and the input keeps its 40px control height.
- **`Name (Bangla)` is optional** on the product editor: migration `0007_product_name_bn_optional` drops
  `NOT NULL` on `product.name_bn` (and on `order_item.product_name_bn`'s snapshot), the check allows
  null, and a blank field stores `NULL` rather than copying the English name.
- **Required markers are red asterisks** with the word in a visually hidden span, on the product form,
  category and brand forms, the COD audit note, confirm dialogs and the delivery default.

**Schema: one additive migration.** `0007_product_name_bn_optional` (two `DROP NOT NULL`, one re-created
check); **tables unchanged at 43**. `drizzle/meta/0006_snapshot.json` was missing from an earlier
hand-written migration and was reconstructed, so the 0007 SQL contains only the intended change.

### Owner-requested density revision (same day, 2026-10-23)

Three storefront decisions in the same revision, all UI only - **no schema, route, data or policy change**:

- **Five products per row on a desktop, not three.** The full-width grid is 2 columns on a phone, 3 from
  720px and 5 from 1200px, and every fixed homepage section publishes five. There is deliberately **no
  four-column step**: five cards in a four-column grid strand one, and a fifth card at 1024px would be
  ~175px, under the 200px floor. At 1440px a card is ~252px, the same width as a catalog-listing card.
  The desk cards had measured ~437px at three across, which the owner rejected as too large.
- **The order is featured, offers, recently added, more to explore**, and the featured row is a plain
  grid of five. The scrolling shelf was removed: it existed to reach a sixth card, so with one row of
  five there is nothing off screen and no controls or scroll bar. `FEATURED_MAX` is 5 for that reason.
- **"More to explore" is a browse row**, not a five-card selection: it leads with the curated collection
  and continues into every product the rows above did not show, up to ten (two desktop rows), ending in
  a centred "View more products" button to `/products`. With 22 products the four sections resolve to
  5 / 5 / 5 / 7 and every product appears exactly once.
- **The announcement strip is left-aligned on the page canvas**, with no background. `--color-action-soft`
  and the pink info variant no longer paint it; the text starts on the brand's gutter.
- **The category index is one row per department on a phone.** Two cards per row gave ~139px of inner
  width for an icon, a name, a blurb and a count, and the count printed over the blurb; the name and count
  now share one line. The category listing also names its category in the `h1` (it said "All products"),
  keeps its filter panel closed on arrival, and its duplicate phone search field is hidden by a rule that
  is no longer overridden.

`ProductGrid` also wraps each card in an `<li>` for the first time: the grid's own track rules and the
odd-count phone span targeted `> li`, but the cards were rendered as direct `<article>` children, so that
span had never actually applied.

**Deliberately not done:** no deployment, no provisioning, no payment gateway, no delivery amount, no new
dependency, and no change to any order state machine, permission or money rule.

**Verified** with `typecheck`, `lint`, `check:i18n`, `check:catalog`, `db:validate`, `db:check`,
`build`, `verify:admin` and `verify:browser` against a served production build; results are recorded in
`docs/project-status.md`. Screenshots at 1440 and 390px were captured and inspected; defects found that
way and fixed include a 240px-wide results column (a collapsed filter removed from the grid let the
results slide into the filter track), an overflowing password pair, a two-click shelf paging step, and a
preview column that pushed every field below the fold on a new product.


### Phase 37 revision - the phone landing gets shorter, and the hero loses its band (2026-10-23)

Two owner corrections to the storefront, both presentation-only:

1. **Below 720px the homepage no longer shows the category strip or the three hero photographs.** The
   phone already reaches the category index twice - the fixed tab bar and the hero's "Browse categories"
   button - so a five-card strip was a third route and cost most of a screen before the first product.
   The teaser photographs went with it for the same reason. Both are hidden with CSS, so the categories
   section stays in the DOM and the tablet/desktop composition is unchanged. `verify:browser` check 36 now
   asserts the omission and check 36d asserts the restoration; check 36b still proves the hero link is a
   44px+ target and 36c that the tab bar carries five destinations.
2. **The homepage hero has no background band.** The lavender panel introduced with the Phase 37 hero was
   removed: the copy and the photographs now sit on the page canvas like every section below them, which
   is what the storefront looked like before, and the page reads as one surface rather than a sequence of
   coloured blocks.

No data, route, price, availability or copy changed. A broken selector was found in the suite while
re-running it (check 27 used `div[class$*="_scroller"]`, which is not a valid CSS selector and aborted the
run at check 34); it was corrected to `div[class*="_scroller"]`.

Verified 2026-10-23 in headless Chromium at 390 / 768 / 1440: the strip and the collage are absent at 390
and present at 768 and 1440, the hero's computed background is transparent at every width, and no page
overflows horizontally.

## Phase 38 - dashboard figures, analytics and promotion codes (implemented locally, 2026-10-23)

The owner compared the panel with **Zatiq Easy** and asked for the three things it does better: graphs on
the dashboard, a real reporting screen, and promotion codes that actually apply at checkout. The three
Zatiq screens were inspected with the owner's explicit written authorization, **as a UX reference only**
(ADR 0021). Nothing was integrated with, and nothing new was added to, the vendor's platform.

**What the dashboard is now.** A greeting, five derived figures (revenue on completed and paid orders,
orders placed, items sold, customers served, and what is waiting on a call), a revenue line and an order
status ring, then the COD worklist, then the recent-order list with the money, catalog and promo cards
beside it. The queue is no longer the first thing on the page - the owner asked for the shop's numbers
first - but it is still above every table, and an empty queue is now one strip rather than a large empty
panel.

**What analytics is.** `/admin/analytics` with a 7/30/90-day window: revenue, orders, items, customers,
average order and discounts; the revenue series with its peak day; the fulfilment mix; what sold; the
money split (customer payments, the delivery fee inside them, recorded extra courier costs, estimated
net); and promo usage. Every figure is an aggregate over order rows computed on read. **The screen states
that visits are not measured**, because this product runs no tracker (D4).

**What promotion codes are.** Two tables and one amendment: `promo_code` (a percentage with an optional
cap, or a fixed amount; optional minimum order, window and usage limit; pause rather than delete),
`promo_code_redemption` (one row per order, unique per order, append-only) and
`order.discount_minor` (an immutable snapshot, checked by the schema so
`total = subtotal - discount + shipping`). A code's use count is `count(*)` over the redemption rows,
never a counter, and the last use is protected by locking the code row inside the order transaction. The
checkout quotes the discount through a POST that writes nothing, and **a code that cannot apply refuses
the order rather than charging more than the screen stated**.

**Owner approval is recorded for the feature, not for a policy guess.** The mechanics are fixed by ADR
0021; the specific codes, percentages and caps are the owner's to create on the screen. No code, amount,
percentage or window was invented in data.

**Schema:** migration `0008_promo_codes` - two tables and `order.discount_minor`, taking the schema
**43 -> 45 tables**, with the order immutability trigger widened to protect the discount. No existing
migration was edited.

**Verified 2026-10-23:** `test` **178/178** (13 new promotion-evaluation tests), `test:db` **255/256**
(8 new promotion tests, including a real order carrying a discount and its redemption; the one failure is
the pre-existing catalog name test described below), `check:i18n` (1148
keys), `check:catalog`, `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `db:validate`
(45 tables, 163 checks, 91 indexes, 12 triggers), and a Chromium walk-through: create a code through the
real form, register a customer, add to cart, apply the code at checkout (10% of Tk 2,250 capped at
Tk 200), place the order, then approve -> dispatch -> deliver -> record payment, and read the resulting
figures back on both screens. **One pre-existing database test still fails** - `tests/db/catalog.test.ts`
"refuses a product that is missing one of its two names" - because the uncommitted migration `0007` made
`name_bn` optional and the test was not updated with it. It is unrelated to this phase and was left alone.

**Not verified:** `verify:browser` and `verify:admin` were **not run against the new screens** (they
cover the storefront and the pre-existing admin surface), real iOS Safari, Android Chrome and screen
readers remain unverified, and the new pages have been exercised in headless Chromium only.

**Not built (each a new owner decision):** coupon links, automatic campaigns, first-order-only rules,
per-customer limits, free-delivery codes, stacking, referral attribution, and any third-party analytics.

**Phase 36 (category editor parity) is implemented locally and is not deployed.** The category screens
are three routes - the list (`/admin/categories`), the create editor (`/admin/categories/new`) and the
edit editor (`/admin/categories/[categoryId]`) - and `?new=1` / `?edit=` are gone rather than kept as
dead aliases. The editor uses the shell the product and promo editors established: one sticky action
bar, a readiness sentence that names the empty fields, the shared two-column layout from 1080px,
explicit validation in words instead of native bubbles, and a preview of the address the category will
have. The right column also carries the two **derived** counts an archive is refused on - live products
and live subcategories - and the list shows the subcategory count per row, so the owner sees what is in
the way before pressing Archive. A refused create or edit returns to the editor that produced it
(`returnTo`, allowlisted to `/admin/categories`, `/admin/categories/new` and `/admin/categories/[id]`)
with a notice code, so typing survives a refusal. **Deliberately not built:** a parent picker or any
subcategory management - that is a decision about depth the owner has not taken, and `parent_id` is read
only to count. **Schema unchanged: 45 tables, no migration.** Two defects were fixed on the way: a
category's slug stays taken after it is archived, so re-using it used to reach the unique index and
surface as a **500** (now refused in the same transaction with the same conflict notice); and the
visibility checkbox could not actually hide a category, because an unticked box posts nothing and the
service reads nothing as visible (the form now posts an explicit `false` beside the box).

Verified 2026-10-23: `typecheck`, `lint` (0 errors, 2 pre-existing warnings), `check:i18n` (1172 keys,
879 referenced), `tests/db/catalog.test.ts` **31/32** (the one failure is the pre-existing product-name
test that migration `0007` invalidated), and an HTTP walk-through against the running dev server:
create through the real route, update to hidden, a crafted `returnTo` refused, missing CSRF refused
(403), archive, an archived id and an unknown id both **404**, old `?edit=` / `?new=` inert, and every
refusal returning a notice code instead of a 500.

**Not verified:** the editor's *client-side* layer - the readiness summary, the blocked-submit alert and
live state - because the shared dev server on port 3000 is serving a stale **production** `.next`
directory, so **no page in the app hydrates** in this environment (`/admin/catalog/new`, which predates
this phase, behaves the same). Routes, redirects, rendered markup and saved rows were verified; the
interactive layer needs the dev server restarted after removing `.next`. Headless Chromium only.

**Phase 39 (Telegram order notifications) is implemented locally and is not deployed (ADR 0022).** The
owner is told about an order without opening the panel: when an order is placed the server posts a short
message to every **active** destination registered at **Settings -> Integrations -> Telegram**. The bot
credential is deployment configuration (`TELEGRAM_BOT_TOKEN`, server-only, never stored, shown or logged -
the screen receives a boolean); recipients are rows in the new `telegram_recipient` table (label, numeric
chat id, active), so several owners each get their own message and one id cannot be registered twice.
A recipient is **paused rather than deleted** and its id is editable, because a mistyped id is the common
mistake. The send is scheduled with `after()` and its failure is swallowed: a chat app can never refuse,
roll back or delay an order, and a replayed checkout (`replayed`) does not notify twice. The screen
carries a **test message** button because Telegram fails silently until the recipient has pressed Start.
**Migration `0009_telegram_recipients`, additive; schema 45 -> 46 tables.**

Verified 2026-10-23: `tests/unit/telegram.test.ts` **16/16** (no network), `typecheck`, `lint` (0 errors, 2
pre-existing warnings), `check:i18n` (1221 keys, 909 referenced), `db:validate` (46 tables, 165 checks, 93
indexes) after applying the migration, a live `getMe` returning `queenbees_orderbot`, a real `sendMessage`
to an unregistered id handled as `{attempted: 1, delivered: 0, failures: ['chat not found']}`, an HTTP
walk-through of add / duplicate-refused / malformed-refused / test / pause / resume / anonymous, and a
Chromium pass asserting the token appears nowhere in the page. **Not verified:** delivery to a real
Telegram account (no owner chat id was supplied), `after()` scheduling under a deployed runtime, and the
Telegram app itself.

**Status note (2026-10-29): the roster can remove a destination, and its cards no longer collide.** Pause
was the only way to stop a notification, so a smoke-test id could never leave the list. *Remove* now sits
beside Pause/Resume, opens a confirmation that names the destination and the id, deletes the row, and
writes `integration.telegram_recipient_removed` (**ADR 0022, decision 3 amended**); a removal that finds no
row is answered "already gone" rather than failing. The screen's three cards stopped using `panel` - which
supplies padding but no vertical rhythm, so the status row met the note and the Add and Save buttons sat
flush against the fields above them - and use `formCard`, the same fix the owner's Settings -> Other report
produced.
`verify:admin` now drives the delivered round trip (add, pause, resume, remove, an already-gone removal,
the empty state), sweeps `/admin/settings/integrations/telegram` for control heights, and refuses an
anonymous removal: **200/200**.
**Delivery charges are configured (2026-10-23).** The owner supplied the three amounts and they are saved
through the real screen: **Dhaka Tk 100, Chattogram Tk 60, other districts Tk 120**. Read back from the
server resolver: `dhaka -> 10000`, `chattogram -> 6000`, `others -> 12000` poisha, and the panel shows
120 / 100 / 60. `npm run db:seed:delivery` writes the same three for a **fresh** database (idempotent and
non-destructive: if a default is already configured it writes nothing, so re-running can never overwrite a
figure the owner has since chosen). **Checkout is no longer blocked by configuration** - the only blocker
that ever prevented a customer from completing a real purchase is gone.

**Phase 42 (guest checkout, owner switch) is implemented locally (ADR 0024).** Ordering still requires an
account by default; a stored setting, `checkout.guest_orders`, lets the owner change that from **Settings ->
Other settings**. With it off, `/checkout` redirects to sign-in exactly as before. With it on, anyone may
order by giving a name, a mobile number, an area, a city and an address - the same required contact block
every order has. A guest order records `customer_id = null` (migration 0010), its `order_placed` event
actor is `guest` (migration 0011), and a promo redemption records a null customer. The guest path is
protected by the same-origin check plus the per-render idempotency key - no session means no CSRF token,
and a signed-in request with a bad token is refused rather than downgraded. A guest confirmation is a
capability URL: `/account/orders/<number>` accepts an anonymous reader only for an order with no customer,
so a customer's number returns 404 to a guest. **No per-source throttle exists yet** - recorded as the
honest gap if guest ordering is ever abused. Verified: switch off -> 307 to sign-in; switch on -> 200 and a
real guest order `QBBFC7E4396F6C7FA6` (customer_id null, shipping 10000 Dhaka, total = subtotal + shipping,
event actor guest); a cross-site guest POST is 403; a customer's order number is 404 anonymously;
`typecheck`, `lint`, `check:i18n`, `db:validate` (46 tables, 166 checks). **Not verified:** a browser
click-through of the guest form (stale `.next`, no hydration on this dev server).
## Current single best next step

**Phase 40 - the ban control was verified, not rebuilt (2026-10-23).** The previous entry here claimed the
owner-facing ban control did not exist. **That was wrong**, and checking before building is why nothing was
duplicated: `/api/admin/customers` has called `suspendCustomer` since Phase 18, the customers list and the
customer detail screen both carry a reason-requiring confirmation dialog (10-500 characters), the route is
gated on `customer.suspend`, and the audit action is `customer.banned`. What was missing was **evidence**,
not code - so the phase exercised it end to end against a throwaway customer: register, ban with a reason,
`/account` no longer resolves to the account, sign-in is refused, a second ban is a **conflict** rather
than a silent rewrite, a short reason is **invalid**, and the audit trail carries the action, the reason
`Confirmed fake order QB1 - no such address` and the actor `Demo Owner`. A control with its own confirmation
dialog was verified positively too: a signed-in customer's page shows their address, and the banned
customer's does not.

**Phase 41 - a ban is reversible (implemented, ADR 0023).** The owner chose to make a ban restorable.
`restoreCustomer` mirrors `suspendCustomer`: a guarded `suspended -> active` transition, a required reason
of 10-500 characters, and one audit record (`customer.ban_reversed`) with actor and reason. It does **not**
resurrect a session (they were revoked at the ban; the customer signs in again), does not touch any order,
refund, reservation or payment, and does not clear the review flag. Restoring an account that is not
suspended is a conflict, and the route requires an explicit `operation` (`ban` or `restore`) rather than
defaulting, so an ambiguous form cannot ban somebody. Both actions live behind `customer.suspend` on the
customer list and profile, each behind a reason-requiring confirmation. Verified: `tests/db/customer-auth`
**12/12** (two new tests), and an HTTP walk-through (restore -> `?notice=restored` -> the customer signs in
again; second restore = conflict; short reason = invalid; missing operation = invalid; audit shows the
reversal). The dialog's own interaction is unverified here, for the hydration reason this document already
records.
**Not authorized by this recommendation:** deploying, provisioning, DNS, credentials, remote database
changes, refunds, courier integration, or changing any ban policy. Banning a real customer, like deploying,
remains the owner's action.

**Also outstanding, and separate:** provisioning and deployment (a real customer cannot reach this build),
image-rights clearance for the 22 products tagged `merchant_source_pending_confirmation`, and the
length-of-retention decision. Each is an **owner decision with its own authorization**, not an
implementation task, and none is implied by any approval to date.

**Phase 43 - the real catalog, order history and customer list (implemented locally, 2026-10-22).** The
owner authorized a one-off export of their previous store (Zatiq Easy, shop 42239) and asked for the local
catalog to be replaced by it. `scripts/import-zatiq.ts` imports a captured export: **1,477 published
products** (+128 unpublished archive rows for items the vendor deleted but an order still references),
245 brands, 15 categories, **1,919 product images** (downloaded and re-encoded to the four variants each
asset needs, 622 MB), **528 customers** and **559 orders** with 1,648 line items and one `order_placed`
event each carrying the vendor's original figures. `npm run import:zatiq -- --reset` is repeatable and
reports every count it writes. Full mapping, deviations and known consequences are in
`docs/migrations/zatiq-easy-import.md`. Verified: **unit 194/194**, **db 258/258**, `typecheck`, `lint`,
`check:i18n`, `check:catalog`, `db:validate` (46 tables, 168 checks), and three served storefront routes
(homepage, listing, product detail) returning 200 with real images. **Three stale test assertions were
corrected, not weakened:** the table count (45 -> 46, the Telegram table), the fixture-only 3:4 aspect rule
(imported photography keeps its own ratio), and the product-name rule (the English name is required, the
Bangla one is optional by schema). **Not verified:** browser interaction (no hydration on this dev server),
and nothing is deployed.

### Phase 44 - the storefront survives the real catalog (implemented locally, 2026-10-23)

The import above broke the storefront in three measured ways, and this phase fixes exactly those. **None
of it is a redesign:** the composition, copy and components are the ones the shop already had.

1. **The header drew all fifteen departments.** The row ran from x=182 to x=1662, painted its tail under
   the search field, and pushed `document.scrollWidth` to **1662 at 1440 and 1652 at 1024** - so every
   storefront page scrolled sideways. The header now shows the **four busiest departments plus "All
   categories"**, the row is 606px, and `overflow: hidden` on the nav means a future catalog can never
   widen the document again. The four are chosen by **product count** (`src/features/catalog/departments.ts`),
   not by the vendor's serial order, which put Accessories and Bags above Skincare's 652 products.
2. **The listing rendered all 1,477 products.** `/products` was 4.0 MB of HTML, **22,752 DOM nodes** and
   145,604px tall. It now pages at **48** (`slicePage`, `?page=N`, numbered pager with a windowed range),
   filters reset to page one, and a page past the end lands on the last page: **1,508 nodes, 5,739px**.
   The same slicing serves `/categories/[slug]`.
3. **Unbounded lists everywhere the import landed.** The homepage strip is **four tiles** (the owner's
   number) instead of three rows of five with a stranded card, and its caption no longer claims "five
   departments". The footer lists five departments then the index. The brand facet - **245 brands** -
   scrolls inside its own panel after a dozen chips instead of pushing the grid a screen down.

**Also fixed while measuring:** the overview counted the COD queue off the five-row preview ("Waiting on a
call 25") while the queue page said 138 - it now reads the real count - and the oldest wait printed
"12968 hours" beside a "540 d" chip, so both now use the same day/hour rule. The tab bar's spacer cleared
the footer by exactly 1px; it now clears by 9. Long vendor category names wrap instead of clipping mid-word.

**Verified: 0 of 44 route x width combinations overflow** (11 routes at 1440/1024/768/390), header nav 6
links, pager "Page 1 of 31", footer 5 + index, `typecheck`, `lint` (0 errors), `check:i18n` (1245 keys),
unit **194/194**. `verify:browser`'s check 36d now expects four departments instead of the fixture's five;
the rest of that suite is written against the 22-product fixture seed and cannot pass against the real
catalog.

### The next step

**Phase 45 - stop shipping the catalog to the browser (recommended).** Every storefront route still carries
**1,477 products in the React payload** - about 2.0 MB of HTML, 267 KB gzipped - because `CartProvider` in
the storefront layout receives the whole catalog to resolve cart lines. *Why:* 267 KB before first paint on
every page is the one cost of the import that pagination did not remove, and it grows with the catalog.
*Prerequisites:* deciding where a cart line is resolved - a small id-and-price projection in the provider
(the cart page then needs the rest) or a server-resolved cart. *Acceptance:* a product page's payload no
longer grows with the catalog, the cart still validates ids against what the shop sells and still renders
names, prices and images, and a route's gzipped HTML stays under ~60 KB.
### Phase 45 - the catalog is no longer shipped on every route (implemented 2026-10-29)

The cart provider no longer receives product records. The layout gives it the catalog's **ids** (for
validation) and the lines; counts are derived from the lines, so the header and tab-bar badge are correct
on every route. `resolveCartLines` turns lines into priced entries, and the two routes that draw lines
(`/cart`, `/checkout`) receive the compact projection (`cart-product.ts`) from their own server pages.

Measured against a production build: `/` **14 KB gz**, `/products` **22 KB gz**, a product page **~12 KB gz**,
`/cart` **81 KB gz**, `/checkout` **82 KB gz**. Before this change every route carried the whole catalog
(**267 KB gz**). A cart line still renders its name, picture, price and availability, and a restored line is
still validated against what the shop sells. A regression found while verifying is fixed: the in-progress
refactor had left the provider without product records, so the cart badge stayed at 0 and `/cart` rendered
empty; it now works end to end (verified by clicking Add to cart and following the line to checkout).

**Still over the 60 KB target: `/cart` and `/checkout`.** Both pass all 1,477 products so a line can be
resolved after a client-side change; that projection is the whole remaining cost.

## The next step

**Phase 45b - resolve cart lines from the cart itself, not from the catalogue (recommended).** *Why:* the
two cart routes are the last pages above ~60 KB gzipped, and their payload grows with the catalogue - a
phone on a slow connection pays for 1,477 products to draw one line. *What:* mirror the cart's line ids and
quantities into a small first-party cookie, read it in `/cart` and `/checkout`, tolerate a mismatch between
the cookie and `localStorage` by validating every id against the catalogue, and project **only those
products** into the page. *Prerequisites:* the owner's approval to introduce one more browser-persisted
value and to choose its lifetime; no provisioning, deployment or new public endpoint. *Acceptance:* `/cart`
and `/checkout` stay under ~60 KB gzipped with one line and with five; a line still shows its current name,
price, picture and availability; a tampered or stale id is dropped rather than rendered; the cart survives
sign-in and a guest's checkout.

*Not authorized by this recommendation:* deploying, provisioning, DNS, credentials, remote database
changes, deleting the order schema, courier integration or refunds. The imported order history was removed
by an explicit owner decision recorded in `docs/migrations/zatiq-easy-import.md`; the schema and the COD
workflow were deliberately kept.

### Phase 45b - the cart page loads the cart, not the catalogue (implemented 2026-10-29)

Phase 45 left two routes over the 60 KB target, and for one reason: `/cart` and `/checkout` received all
**1,477 products**, because the server had no way to know which products a line needed. The lines live in
`localStorage`, which a server component never sees.

**The cart now mirrors its line ids into a first-party cookie** (`qb_cart`: ids only, `path=/`,
`SameSite=Lax`, 30 days, removed rather than emptied when the cart is empty). `/cart` and `/checkout`
read that list, validate every id against the catalog and project **only those products**
(`selectCartProducts`). No quantity, price or name travels in the cookie, so a forged value can change
which products a page mentions and nothing else - it cannot add a line, price one or place an order.

**Measured on a production build** against the 1,605-product catalog, gzipped transfer:

| Route | no lines | 1 line | 5 lines | before this phase |
| --- | --- | --- | --- | --- |
| `/cart` | 8.9 KB | 9.1 KB | **9.4 KB** | 81 KB |
| `/checkout` | 9.1 KB | 9.3 KB | **9.6 KB** | 82 KB |

**The mismatch is handled rather than hoped away.** The cart and its mirror can disagree - a browser that
drops the cookie, a cart saved before the mirror existed, a tampered value. `useCartProjection` writes the
mirror from the live cart and refreshes the server tree **once**; if the gap survives that, the page says a
line could not be loaded and `/checkout` **disables Place order**, because the submitted payload is built
from the lines the page could resolve and an order must never be placed with a line silently missing. The
recovery is bounded to one attempt per distinct set of missing ids, so a browser that refuses the cookie
cannot cause a refresh loop.

Verified 2026-10-29: a headless Chromium click through the real cart produced `qb_cart=4838` and one
rendered line; five stored lines rendered five names and a **Tk 4,110** subtotal; a deleted cookie recovered
itself in one refresh; a browser made to refuse the cookie showed the notice with Place order disabled; a
tampered cookie (`999999`, script text, path traversal fragments) returned 200 with nothing projected.
New unit tests cover the parser (id shape, duplicates, the 40-id cap, truncation). `typecheck`, `lint`
(0 errors), `check:i18n` (1,249 keys), unit **200/200**, database **258/258** and `build` all pass.

**Known limits:** losing the mirror costs one extra round trip on the first cart-page load, and the
"could not be loaded" state was reproduced by overriding `document.cookie` in Chromium, not on a device
with cookies disabled at the browser-settings level. The cookie is visible to any script on this origin,
which is accepted: it holds ids the storefront already publishes.

## The next step

**Phase 46 - put the rendered-behaviour suites back on the real catalogue (recommended).** *Why:* the
project's own two verification gates for rendered behaviour, `verify:browser` (storefront) and `verify:admin`,
are written against the 22-product fixture and the order fixtures of Phases 14-42. Against the imported
catalog and an empty order table they no longer pass, so every phase since 43 has been verified with
task-specific probes that run once and are never re-run - which is exactly how the cart regression in Phase
45 was found late. A suite that cannot fail cannot guard anything. *Prerequisites:* none beyond a local
database and a served build; this changes scripts and fixtures only. It does **not** authorize deployment,
provisioning or a new dependency (the suites already drive Chromium over CDP with Node built-ins). *Acceptance:*
both suites run green against a seeded real catalog of 1,000+ products and an empty order table, they seed
and clean up their own order fixtures instead of assuming one exists, and no assertion is weakened or
deleted to make them pass - a check that no longer means anything is removed with a written reason.
### Phase 46 - implemented in part (2026-10-30): suite reads the catalogue, and verification is scoped

**Owner decision (2026-10-30): stop running the full suites after every small change.** `verify:browser`
takes tens of minutes against a real catalogue and `verify:admin` builds its own cluster; using either as a
per-step gate is cost without information. The cadence is now:

- **Per change:** `npm run verify:ui` - `scripts/verify-ui-fixes.cjs`, nine checks that cover exactly the
  2026-10-29 audit's UI-01 to UI-09 (focus clearance under the phone bar, promo control scale, the promo
  refusal summary, the 320px money fields, the recovery panel gap, the analytics period rail, 40px brand and
  title targets, the scrollable audit region, and the spanning related card). It signs in with
  `QUEENBEES_ADMIN_EMAIL`/`QUEENBEES_ADMIN_PASSWORD`, drives Chromium over CDP with Node built-ins, adds no
  dependency, and takes about a minute. Every check names the defect it guards. Verdict 2026-10-30: 9/9.
- **At a phase checkpoint, or on request:** `npm run verify:browser` and `npm run verify:admin` in full.
- **Never:** a full-suite run quoted as evidence for a change it was not run against.

**`verify-browser.cjs` no longer carries fixture constants.** It used to pin 22 products, six per category,
one search hit, one product slug, thirteen discounts and a fixture cart product id, which is why it could not
run against the imported catalogue at all. Every expectation is now read from the catalogue under test
(pagination total, card prices, category and brand filter links, a discounted sample product), the price-sort
check walks **every** listing page by fetching markup rather than navigating, and the cart assertions are
shape-based rather than id-based. Two facts genuinely cannot be proved from a browser - the curated
collection behind the featured row and the stored `created_at` order that the recency row claims - so they
are reported as a stated **SKIP** with their reason, and `verify-storefront.ts` passes
`QUEENBEES_EXPECTED_RECENT` from the rows it seeded so the ordering assertion still executes there. A skip is
never counted as a pass.

**Verified 2026-10-30 - both runs green, and the numbers are the runs' own.**

| Run | Command | Result |
| --- | --- | --- |
| Real imported catalogue (1,605 products, 559 imported orders) | `QUEENBEES_BASE_URL=http://127.0.0.1:3200 node scripts/verify-browser.cjs` | **91/91 passed**, 7 stated skips |
| Fixture-seeded disposable cluster | `npm run verify:storefront` | **95/95 browser checks**, **32/32** HTTP customer-flow checks, 1 stated skip |
| Admin surface, own disposable cluster | `npm run verify:admin` | **200/200** checks |

The seven skips on the imported catalogue are all owner data a browser cannot establish: no curated
collection (checks 27, 31, 31b, 31c), the stored `created_at` order (28b-db, 42-db), and no brand filter in
that catalogue's sidebar (6). The fixture-seeded run executes the collection, featured-row and recency
ordering assertions - it passes `QUEENBEES_EXPECTED_RECENT` from the rows it seeded - so none of those
assertions was dropped. The single skip there is check 6: the seeded fixture catalogue renders no brand
filter. The suite makes **no ordering dependency on order rows**, so the imported 559 orders and an empty
order table are equivalent for it; it seeds nothing and needs no cleanup.

**The guest path is covered now (2026-10-30).** The residual hole this phase named was the storefront's own
guest ordering (D12 switch, ADR 0024), which had no durable check - the same gap that once let the guest switch
store `false` for a ticked box. Five checks were added to `scripts/customer-flow.ts`, all against the served
route: refused while the switch row is **absent** (and no order written), a **cross-origin** guest post refused
with 403 and no order, a guest places **one order without an account** (order row has `customer_id is null`, the
`order_placed` event records `actor_type = 'guest'`, and no session cookie is issued), the **receipt renders for
its own number only** (an unknown number and a customer's own order both 404 anonymously), and the run **leaves
no order rows** and restores the switch to its absent state. Cleanup is `TRUNCATE`, not `DELETE`: `order_event`
and `order_item` refuse row deletes by trigger, which is why `scripts/purge-imported-orders.ts` does the same.
The suite writes the setting key as a literal rather than importing the server module, because that module binds
`src/db/client` to the developer's own `DATABASE_URL` - a different database from the run's disposable cluster.
`verify:storefront` is now **95/95 browser + 32/32 HTTP** (was 27; the five guest checks), still one stated skip.

**Note on the runtime gate:** `next build` stops once per fresh build on Next's own security-advisory nudge and
proceeds when the same command is retried. That is framework behaviour, not a project check - and it bites
`verify:storefront` too, whose first attempt in a session fails at its own `next build` and whose retry passes.
Treat "build exited 1 with SecurityFatalError" as a retry, never as a project failure.

---

**Status note (2026-10-29): the premise above is half-out of date, and running the suite is what showed it.**
`verify:admin` **does** run and pass - **193/193** - against the imported catalogue, because it builds its own
disposable cluster, migrates it, seeds its own reference data and drives the real production build over HTTP;
it never touches this project's `queenbees_dev` database. So the suite is stale in *coverage*, not in
runnability: it had no check on the Settings group at all, which is why the guest-ordering switch could store
`false` for a ticked box, and no check on the category editor's visibility direction, for the same reason.
Both are covered now. The remaining work this phase describes is therefore (a) `verify:browser` against the
real catalogue, which is the suite that genuinely cannot run today, and (b) the coverage holes of the same
kind - the storefront's own guest path and the Settings screens - rather than a suite that is simply broken.

## Phase 51 - homepage revision: one canvas, one card size, one carousel (implemented locally, 2026-11-02)

Owner direction, in their words: remove the pastel field from the sections, keep the hero until they decide
its taste, drop the explanatory lines, give the offer / category / brand / new-arrivals rows ten products as
carousels, keep the featured card as the homepage's measurement, give "Shop by brand" its own card carousel,
make "More to explore" two desktop rows, shorten the footer, and make Brands its own page and its own
navigation destination.

**What changed.**

- **No tinted section fields.** The hero, the offer row and the brand row lose their pastel backgrounds; the
  campaign band takes the same bordered surface as every other card. The page is one canvas and space does
  the separating. The hero's composition is untouched - its redesign is a separate owner decision.
- **No explanatory sentences.** Every section heading lost its caption ("Priced below their published
  comparison price" and seven siblings). The dictionary keys went with them.
- **One card size.** The featured row's card is the homepage's measurement; the new shared
  `Carousel` reproduces the product grid's track exactly (`(100% - 4 * gap) / 5` from 1200px, three from
  720px, two below), so a shelf card and a grid card are the same width.
- **One carousel component** (`src/components/Carousel.tsx`, replacing `OfferCarousel`): a CSS scroll-snap
  track with measured page counts, dots that state `aria-current`, and previous/next buttons from 1024px.
  It draws On offer (10), Shop by category (10 circles), Shop by brand (10 cards) and Recently added (10).
- **The category circle hover no longer clips.** The ring and lift were drawn outside the tile, which a
  scroll container cropped; the treatment is now a border on the circle's own box, a photograph zoom the
  circle crops, and an inset focus outline. A missing category photograph is the page's sunken surface with
  the department's icon, not a lavender disc.
- **The brand row is a card per brand** (owner reference: Ghorer Bazar's "Our Brands" - anatomy only): the
  mark centred on a white card, the brand's name and its product count beneath, four across on a desktop.
- **Featured and "More to explore" fill their rows on a phone**: four of five featured cards and eight of ten
  browse cards below 720px, nine of ten between 720px and 1199px (three columns), ten from 1200px. CSS only -
  no product is repeated, re-ordered or invented to make a count.
- **The footer is short**: the department list is gone, two groups of three links (Shop / Account) and the
  year remain, and on a phone the groups sit side by side.
- **Brands is its own destination.** `/brands` existed already; it is now the last item of the desktop header
  navigation and the fourth tab of the phone bar (after Categories, six tabs in total), and the brand teaser
  was removed from `/categories`, which answers only the department question and links out to the index.

**Verification, 2026-11-02 (local only; nothing deployed).**

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (3 pre-existing warnings in tests/scripts) |
| `npm run check:i18n` | 1,360 keys, all referenced keys present |
| `npm run check:catalog` | 22 products, 5 categories, 5/5 featured, 5/5 collection |
| `npm run check:secrets` | clean, no server-only marker in 57 client bundle files |
| `npm test` | 214/214 (`tests/unit/recent.test.ts` updated: the section size is ten) |
| `npm run build` | success |
| Headless Chromium, 360/390/768/1024/1440 | sections, dots, card counts, tab-label widths and zero horizontal overflow measured by hand |
| `npm run verify:browser` against the served build | **91/97**, six explained failures (below) |

**The six failures in that run, all explained and none of them a defect in this change.**

- **27, 31, 35, 36d** are **data-limited**: this development database holds the 22-product seed, not the
  imported catalogue. Its curation holds **2** featured products (the checks require the row of five), it has
  **4** products with a comparison price (the offer checks require five or more) and **5** categories (check
  36d requires ten). The limits themselves - ten offers, ten categories, ten brands, ten new arrivals, two
  browse rows - are set in `home-selection.ts` and are reached only by a catalogue that large.
- **8 and 20** are **pre-existing and unrelated**: they read the product page, and the uncommitted Phase 50
  gallery work (`src/features/catalog/product/GalleryCarousel.*`) renders 24px dot buttons - check 20 wants
  40px - and lazy photographs below the fold that check 8 counts as unloaded. Neither file is touched here.

The checks themselves were updated, not weakened, where the design changed: 42/42b/42c/44/45/48/48b now assert
ten cards on a scroll-snap shelf whose card width is the standard grid's (\u00b18px for percentage rounding)
and whose page never widens, that the section is headed as recency with **no caption**, and that the cards on
screen have decoded while the rest stay lazy. A probe that read the first `<p>` in the section was corrected
to read the section header: it had been reading a product card's brand line as the section's caption.

Real iOS Safari, Android Chrome and screen readers remain unverified.




## Phase 51 - Homepage hero carousel (2026-11-04)

**Owner direction.** Replace the homepage hero with an image carousel following the supplied reference:
one banner at a time, dots, responsive at every width. The images and their sequence are managed in
Settings -> Homepage hero, with at least one image, at most ten, and manual ordering.

**Implemented.**

- **`hero_image`** (migration `0013_homepage_hero_images`, schema 46 -> 47 tables): an asset key, an
  owner-written description, and a dense position. Unique key, key-format and alt-length checks, position
  0..9. The 1..10 bound is enforced by the service under a transaction advisory lock, which also rewrites
  dense positions atomically.
- **`npm run assets:hero`** turns the owner's masters in `hero/` into 800 and 1600px variants in WebP
  and JPEG under `public/hero`, cropped to 16:9. Association-only: no upload, no client path and no
  metadata from the request; `readHeroAsset` checks the format, the complete variant set and the bytes.
- **Settings -> Homepage hero**: ordered rows with preview, description editing, earlier/later movement,
  remove-behind-confirmation, an add picker over the generated library, a save-order form, and the bounds
  stated before they are hit.
- **Storefront**: `HeroCarousel` is a CSS scroll-snap track with a required h1 for the outline, native
  swipe, 32px dots with `aria-current` on the image's lower-left corner, and two 44px arrows from 720px.
  No autoplay. An empty table renders no section, never a placeholder. The old copy/spotlight/collage
  hero and its three dictionary keys were removed.
- **Audit**: `settings.hero_image_added`, `_updated`, `_removed` and `settings.hero_images_reordered`.

**Verification (2026-11-04, local only; nothing deployed).**

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors |
| `npm run check:i18n` | 1,395 keys, every referenced key present |
| `npm run check:catalog` | unchanged, 22 products |
| `npm test` | 207/207 |
| `tests/db/hero.test.ts` | 5/5 (add, reorder, description, duplicate/unknown/empty refusal, last-image refusal, ten-image cap) |
| `npm run build` | success |
| HTTP against the served build | reorder persisted and the storefront's first slide changed; remove and add persisted; removing the last image returned `invalid` and left one row; duplicate -> `conflict`; traversal-shaped key -> `invalid` |
| Headless Chromium | 390px: 2 slides, 2 loaded images, 0.563 aspect, 2 dots at 32px, dots switch the slide, no overflow, no arrows, and the hidden h1 is present; 1440px: 2 arrows visible and paging; admin: 2 rows in the stored order, thumbnails loaded, 40px row controls (34px only on the dense description action) |
| `npm run verify:admin` | **198/200**. The hero route is included in the control-scale sweep and passes. The two failures are unrelated and pre-existing: a Telegram removal-dialog flake, and the documented absent-CSP check. |
| `npm run verify:storefront` | **91/97** browser checks. Hero checks 28/28b/28c/36/36b pass. The six failures are the ones already recorded against this seed: 8 and 20 are the uncommitted Phase 50 gallery's 24px dots and below-fold lazy images; 27, 31, 35 and 36d are data-limited because this catalog seeds 2 featured products, 4 offers and 5 categories against checks that expect 5, 5+ and 10. The customer HTTP flow is not reached because the suite exits on the browser failure. |

**Limits.** There is **no browser upload**: a new banner arrives through `npm run assets:hero` and is then
associated in the admin screen, the same rule product imagery follows (no object storage is provisioned).
This was verified against the 22-product seed; the imported catalogue and real devices were not used.


## Phase 53 - SteadFast courier booking on COD confirmation (2026-11-08)

**Owner direction.** Book a COD order with SteadFast when the owner confirms it by phone, and add a
settings screen where the owner enters the courier's secrets.

**Implemented (ADR 0028).**

- **`steadfast_consignment`** (migration `0016_steadfast_consignments`, schema 50 -> 51 tables): one row
  per order, unique `order_id`, unique `invoice`, unique courier `consignment_id`, the courier status, the
  COD amount in poisha and `status_checked_at`. It stores no credential and no second copy of the
  customer's details.
- **`src/server/integrations/steadfast.ts`** - the account (`store_setting` keys `steadfast.api_key`,
  `steadfast.secret_key`, `steadfast.enabled`), the payload builder (invoice, name, 11-digit phone,
  composed address, BDT `cod_amount`, note) and the client (`create_order`, `get_balance`,
  `status_by_cid`) with an 8-second bound and the courier's own message surfaced, bounded.
- **`src/server/integrations/steadfast-booking.ts`** - booking in its own transaction with a
  transaction-scoped advisory lock, refused/failed attempts audited in a separate transaction, and a
  status refresh that writes only the mirror.
- **`POST /api/admin/orders-cod`** books after the approval commits and states the outcome on the queue
  (`approvedBooked` / `approvedBookingFailed`). **`POST /api/admin/orders/consignment`** offers the retry
  (`send`, `cod.approve`) and `refresh` (`order.read`).
- **Settings -> Integrations -> SteadFast** - masked keys, the default-off switch, **Test connection** and
  a confirmed removal. The integrations hub lists it beside Telegram.
- **Order detail** shows the consignment, the courier status with the time it was read, and the actions.

**Deliberately not built.** No label, pickup request, bulk create, fraud check, courier statement import,
cash reconciliation or automatic order transition from a courier event; no courier other than SteadFast.

**Verification (2026-11-08, local only; nothing deployed).**

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 pre-existing warnings |
| `npm run check:i18n` | 1,666 keys, every referenced key present |
| `npm run build` | success, the three new routes present |
| `npm test` | 238/238 (20 new SteadFast unit tests) |
| `npm run db:migrate` / `db:validate` | 17 migrations applied; 51 tables, 188 checks, 102 indexes, 12 triggers |
| HTTP smoke, real routes + stub courier | keys saved and masked (neither value in the HTML), balance read, approval booked the exact payload, order page showed id/tracking, refresh stored `delivered` without moving the order, a second send answered "already booked", a non-bookable order refused with no row, account removed with both keys gone |
| HTTP smoke, stub stopped | approval still succeeded, no row written, `order.steadfast_booking_failed` audited, retry offered |

**Limits.** `verify:admin`, `verify:browser`, `verify:storefront` and the db suite were not re-run for
this change, and the live SteadFast API was never called: the smoke used a stub through the
development-only `STEADFAST_API_BASE_URL`.

## Phase 54 - conditional delivery, repeat-customer pricing and payment instructions (2026-11-08)

**Owner direction.** Conditional delivery charges above a minimum purchase, repeat-customer delivery
rates, an automatic repeat-customer discount, and a checkout block publishing the advance-payment
rules (ADR 0029).

**Implemented.**

- **`delivery_setting`** gains eleven additive columns (migration `0017_pricing_rules`): the conditional
  switch, its minimum and three area rates; the repeat-delivery switch, its Chattogram and
  "Dhaka + other districts" rates; the repeat-discount switch, its whole percentage and its minimum.
  Range `CHECK`s on every amount and on the percentage. Table count unchanged at **51**.
- **`src/lib/delivery.ts`** - `quoteOrderDelivery` implements repeat -> conditional -> district
  override -> default -> refusal, and `repeatDiscountMinor` implements the floored automatic discount.
  `src/server/delivery/service.ts` loads and saves the rules (three audited operations) and answers
  `isRepeatCustomer` from `order.status = 'completed'`.
- **`createOrder`** reads the customer's standing inside the transaction, resolves the charge with the
  shared function, adds the automatic discount to any promotion and caps the pair at the subtotal.
- **Settings -> Delivery charges** gains three sections with their own saves; a rule cannot be switched
  on without its values.
- **Checkout** names the automatic discount and, below the threshold, the advance delivery amount; the
  cart shows the discount too. **Settings -> Contact and policies** gains the payment-instructions
  editor (`payment.instructions`, `payment.bkash_number`, `payment.send_money_note`,
  `payment.advance_threshold_minor`, audited), and the checkout payment card renders those owner
  records with the number bold and a copy button.
- **Cash on Delivery remains the only order method.** No payment state, claim, screenshot or
  verification is written; the instruction block is copy the owner confirms on the phone.

**Deliberately not built.** No payment-method selection, claim or verification queue (ADR 0015 stands);
no scheduled campaign, per-product rule, coupon stacking engine, gateway or courier integration.

**Verification (2026-11-08, local only; nothing deployed).**

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 pre-existing warnings |
| `npm run check:i18n` | 1,714 keys, every referenced key present |
| `npm test` | 251/251, including 19 pricing cases |
| `npm run build` | success |
| `db:migrate` / `db:validate` | `0017_pricing_rules` applied; 51 tables, 191 checks |
| HTTP settings walk-through | four rule groups saved, audit rows present, a half-configured rule refused and nothing changed, saved values prefill |
| `createOrder` matrix | guest/new/repeat at 810, 1500 and 2510 BDT, Chattogram, and a cancelled-order customer - all ten cases return the expected shipping, discount and total |
| Chromium, 1440px and 390px | instructions, number, copy control and caution render; default / conditional / repeat delivery as specified; 5% row for the repeat customer; advance line under 500 BDT; rules off restores the conditional rate and removes the discount in checkout and cart; no horizontal overflow |

**Limits.** `verify:admin`, `verify:browser`, `verify:storefront` and the db suite were not re-run for
this change; the copy button was verified as a rendered control but its clipboard write was not driven;
real devices and screen readers were not used.

## Phase 55 - customer email account security through Resend (2026-11-08)

**Owner direction.** Send customer account email through Resend, make password recovery self-service,
and add password and email management to the account page - with no email verification anywhere.

**Implemented (ADR 0030).**

- **No verification, unchanged registration.** An account works at creation, registration still signs
  in, and no verification screen, banner, mail or gate exists. Nothing was removed because nothing was
  present; the requirement was already true.
- **Recovery**: `/account/forgot-password` -> `POST /api/account/recovery` (throttled by address and
  source, identical answer in every case) -> mailed link -> `/account/reset` ->
  `POST /api/account/reset`. Token: 256 bits, SHA-256 at rest, single-use, one hour. All sessions are
  revoked; the customer signs in with the new password. The owner-issued code remains.
- **Password change**: account-page form -> `POST /api/account/password` with the current password and
  session CSRF; all sessions revoked and one replacement minted for the current browser; a
  password-changed notice is mailed.
- **Email change**: account-page form (new address + current password) -> `POST /api/account/email`
  stores a pending `customer_email_change` row and mails the confirmation to the **new** address ->
  `/account/confirm-email` button -> `POST /api/account/confirm-email` moves the address, marks it
  confirmed, revokes every session (`email_change`) and mails the previous address.
- **Email client and templates**: `src/server/integrations/email.ts` (Resend HTTP API, 8 s bound, no
  throw, never logs an address) and four table-HTML templates in the owner's palette with escaped
  request values and plain-text alternatives. `src/server/customer-auth/email-delivery.ts` builds the
  links and schedules delivery with `after()`.
- **Schema**: migration `0018_customer_email_change` adds `customer_email_change` (partial unique for
  one live change) and one `customer_session.revoked_reason` value. Schema **52 tables**, additive.

**Deliberately not built.** No verification flow, no registration mail, no SMS, no OAuth, no customer
name-change form, no admin mail surface, no owner notification for these actions.

**Verification (2026-11-08, local only; nothing deployed).**

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 2 pre-existing warnings |
| `npm run check:i18n` | 1,759 keys, every referenced key present |
| `npm test` | 264/264, including 13 email client/template cases |
| `npm run build` | success |
| `db:migrate` / `db:validate` | `0018_customer_email_change` applied; 52 tables, 194 checks |
| Stub-Resend HTTP flow | 59 checks: no mail on registration, recovery delivery and token contents, reset + reuse + expiry, unknown-address parity, password change refusals (wrong, mismatch, weak, no CSRF) and session replacement, address change refused for taken/same, confirmation not applied on open, previous-address notice, used and expired links refused, five-per-hour recovery cap, owner sign-in and admin access unaffected, customer cookie refused by `/admin` |
| Chromium, 390px | forgot-password, reset and confirm pages render; sign-in links the new flow; account page shows both forms with CSRF; no horizontal overflow |

**Limits.** `verify:admin`, `verify:browser`, `verify:storefront` and the db suite were not re-run; no
real address received a message (the client was pointed at a local stub through the development-only
override); the mail client's rendering in real inboxes and real devices was not exercised.
