# Implementation plan

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

## Current single best next step

**The owner-operated customer credential reset** - the one launch gap that blocks a customer permanently.
Customer authentication is first-party with **no self-service password recovery** (D17, ADR 0012): the
interface states the gap, and ADR 0012 names the owner-operated reset with one-time credentials, audit
logging and session revocation as the documented alternative. **It does not exist.** Every other launch
gap either has a workaround already in place or is waiting on an owner input; this one has neither. A
customer who forgets a password today is locked out of an account that holds their order history, and the
owner has no way to restore it - the same dead end ADR 0012 was written to prevent.

**Why this and not the alternatives.** It is the only remaining **launch blocker** (a real customer can be
permanently excluded), it was **already authorized in scope** by ADR 0012 rather than invented now, and it
reuses infrastructure that exists: the owner-issued recovery primitive the owner surface already has, the
customer session store, the throttle, the audit writer and the permission catalogue. The other documented
gaps are not equal candidates: refunds are deferred by this decision; the owner-facing customer-ban control
is a convenience over a primitive that already exists and is enforced in the order transaction; delivery
amounts, failed-delivery handling, retention and image rights are **owner inputs**, not engineering work,
and no code can start until they are supplied; analytics, dispatch/consignment and cash reconciliation sit
outside the confirmed workflow (ADR 0017) or depend on the same owner inputs.

**Prerequisites:** the **existing** `staff_recovery_token` flow is the model, and no new table is needed -
the customer recovery token table already exists in the schema, unused. Owner approval of one product
detail: **how the one-time credential reaches the customer**, given that no mail or SMS provider is
authorized (ADR 0012) - the owner reading it to them by phone during the call they already make is the
documented path, and it must be stated in the interface rather than implied.

**Acceptance:** the owner can issue a one-time customer credential from the customer's own screen, with a
required reason; issuing it **revokes every active customer session** for that account and refuses to
work for a suspended account without stating why to the customer; the customer can sign in with the
one-time credential exactly once and must set a new password before using the account further; an expired,
used or superseded token is refused; every issue, use and refusal is audited with actor and timestamp,
and a refusal is recorded durably outside the failing transaction; no password, token plaintext or
credential reaches the logs, the audit trail, the RSC payload or a client bundle; the flow is available
only to a principal holding the catalogued permission, is re-checked in the service, and is covered by
database tests for the once-only and revocation rules and by a browser check that drives the real screen.

**Not authorized by this recommendation:** deployment, provisioning, DNS, credentials, mail/SMS/OAuth
providers, refund work of any kind, courier integration, inventory reservation, or any new
cancellation, retention or delivery policy. Do not begin without explicit owner authorization.
