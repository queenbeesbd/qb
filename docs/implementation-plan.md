# Implementation plan

Status: Phases 0-8 complete (2026-10-11). **Phase 9 is complete: every blocking decision is owner-approved** - D1 (Neon PostgreSQL), D2 (Vercel), D3 (Neon Object Storage), D7 (manual bKash + manual Nagad + COD), D8 (sender number and transaction reference required, no screenshot), D9 (payment and order policy), D11 (inventory reservation and release) and D12 (account-required checkout). **Phase 10 is complete: the data model, state machines and security architecture are designed and documented** in `docs/data-model.md` and `docs/security.md`. **Nothing is implemented** - no database, migration, dependency, credential or resource exists. **Phase 11 is unblocked but not started**, and nothing beyond Phase 10 is authorized to begin automatically. The owner has approved an **independent e-commerce platform** (`docs/decisions/0004-independent-platform-direction.md`); the previous plan to integrate with the Zatiq merchant platform is **withdrawn**, and Zatiq is now a UX reference only. Nothing beyond Phase 8 is authorized to begin automatically.

Supporting documents: `docs/platform-architecture.md` (architecture and the decision register in section 11), `docs/payment-workflow.md` (manual MFS verification design), `docs/admin-dashboard.md` (dashboard scope and analytics), `docs/migration-plan.md` (catalog migration), `docs/security.md` (security requirements), `docs/backend-capability-audit.md` (Phase 7 reference findings).

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

1. **D9 - unpaid-order expiry: 24 hours from placement**, applying **only** to orders with no submitted payment claim. An order awaiting verification never expires automatically, and an expired order is revived only after re-checking stock.
2. **D9 - cancellation after the window: support decides before dispatch**, and after dispatch the case becomes a **delivery cancellation / return**.
3. **D9 - COD lifecycle: owner approval before dispatch**, support cancellation before dispatch, the return workflow after, return-to-store on failure, and **separate delivery-completion, cash-collection and reconciliation states**.
4. **D11 - allocation bound: at most one active submitted claim per unit**, so no further claim is accepted once a unit carries one.

These fix the **schema and transaction shape** and the **order state machine**, which is why Phase 10 was held.

**Approved and closed:** D1 (Neon PostgreSQL), D2 (Vercel), D3 (Neon Object Storage), D7 (manual bKash + manual Nagad + COD), D8 (sender number and transaction reference required, no screenshot), **D9** (payment and order policy, including expiry, cancellation and the COD lifecycle), **D11** (inventory reservation and release), and D12 (account-required checkout).

**Not blocking Phase 10** (needed later, no rework cost): payment recipient accounts; staff authentication approach and verifying roles (D10, D13); courier providers and COD cash settlement; notification channels; reconciliation cadence; sufficient-evidence definition.

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
- **D9 - approved.** Binding: the **24-hour verification maximum** (internal, explicitly **not** a customer-facing promise); the **exceptions queue** so a genuine payment is never silently discarded and its reservation is never auto-released; **fake-order findings** with an audited reason and actor plus a **separate** customer review flag; the rule that **`rejected` is not an accusation**; **cancellation through support**; **manual refunds** with separate `requested`/`processing`/`completed`/`failed` states; **COD owner approval before dispatch**; the **five-way state separation**; a **24-hour unpaid-order expiry** that never touches an order with a submitted claim; **cancellation after the window** as a pre-dispatch support decision or a post-dispatch return; and the **full COD lifecycle**. Text: `docs/payment-workflow.md` sections 13.1-13.9.
- **D11 - approved.** The owner's rule: the **first submitted payment claim gets the product**, so a later claim **preempts** an earlier order that has **not** submitted a claim. An order that has submitted a claim is **never** preempted and **never** released by a timer. The bound is **at most one active submitted claim per unit**. Atomic allocation, no oversell, idempotent release and inspection-before-restoration are binding. Full analysis: `docs/payment-workflow.md` section 13.10.
- **No unresolved decision remains.** D9 and D11 are fully approved; the deferred entries (D5, D6, D10, D13-D16) are named in the register and do not block Phase 10.
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
- **Owner decisions:** **D17 (customer authentication provider) is newly raised and blocks implementation of checkout.** D10, D13-D16 remain open and do not block the design. **Out of scope, and not performed:** application code, migrations, dependency installation, environment or configuration changes, credential creation, provisioning, deployment, DNS, and any expiry job or automatic stock-release logic.

### Phase 11 - independent backend foundation (complete - local only)

- **Objective:** stand up the platform skeleton with no commerce behaviour yet.
- **Status:** **complete, locally.** Implemented and verified against a disposable local PostgreSQL cluster. **Nothing is deployed and no cloud resource exists.**
- **Decisions resolved to unblock it:** **D14** - Drizzle ORM + drizzle-kit, pinned to stable `0.45.x`; and the driver question it raised - **`@neondatabase/serverless` Pool over WebSockets** for the deployed runtime, because the D11 claim-allocation transaction is interactive and Neon's HTTP driver is documented as non-interactive only. Both recorded in **ADR 0007** as **D14** and **D18**. Migration `0001` establishes the full approved schema (owner decision, 2026-10-11).
- **Deliverables produced:**
  - **Schema:** all 39 approved tables in `src/db/schema/`, with 209 CHECK constraints, 13 partial unique indexes and 8 guard triggers.
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
- **Owner decisions:** **D17 (customer authentication provider) still blocks implementation of checkout.** D10, D13, D15 and D16 remain open and do not block this phase. **Out of scope, and not performed:** provisioning, deployment, DNS, credential creation, any storefront or admin UI, any provider integration, and any commerce feature.

### Phase 12 - Owner/Admin Authentication & Dashboard Foundation (unblocked; not started)

- **Objective:** protect the **private administrative interface for this store's owner**, so the owner can sign in safely to a real, authenticated shell. This is **not merchant onboarding**: QueenBee's is a single-store shop (ADR 0008), so there is no merchant registration, no seller dashboard and no multi-store switcher to build.
- **Deliverables:** owner login with hashed credentials; server-side sessions in httpOnly cookies with creation, expiry, revocation and logout; owner-issued credential recovery (no mail provider is authorized, so recovery cannot depend on email delivery); server-side authorization enforced on every administrative route and mutation; an auditable administrative activity trail; a minimal admin shell consistent with the existing design system and bilingual labels.
- **Optional, and conditional:** staff accounts and permission grants, **only** where a documented requirement justifies them and the owner explicitly approves. A large multi-role workforce is not assumed.
- **Dependencies:** Phase 11 (complete).
- **Acceptance:** unauthenticated access to every admin route is refused server-side; an actor without the permission cannot perform the action even by direct request; no administrative credential or session token reaches the client bundle; sessions expire, revoke and log out correctly; audit entries are written for a test change.
- **Verification gate:** authorization tests per role, plus a session and cookie inspection.
- **Risks:** treating UI hiding as authorization; a weak recovery flow; over-building a role model for staff that the requirements do not justify.
- **Owner decisions:** **D13** (staff authentication approach) and **D10** (which roles may perform sensitive operations). Both are reconciled against the single-store model in `docs/decisions/0008-single-store-product-model.md`; until D10 is answered the seeded role set stays **owner-only**. **Out of scope:** product, order or analytics features, and **all customer authentication** - that is D17 and belongs to the checkout phase.

### Phase 13 - product and category management with catalog API (blocked on Phase 12)

- **Objective:** the merchant can maintain the real catalog, and the storefront can read it.
- **Deliverables:** product and variant CRUD with bilingual name/description, brand, images, price, comparison price, stock and publication status; category CRUD with bilingual names, ordering and visibility; curation (featured and collection) as ordered id lists; image upload with derivative generation; search, filtering and pagination; a read API for the storefront.
- **Dependencies:** Phase 12; image storage decision from Phase 9.
- **Acceptance:** a product created in the dashboard is retrievable through the storefront read API with correct bilingual fields and integer-poisha prices; unpublished products do not appear publicly; stock edits are recorded as inventory movements; curation caps are enforced.
- **Verification gate:** create/edit/unpublish round trip, plus bilingual and money assertions.
- **Risks:** image pipeline complexity; bilingual fields treated as an afterthought.
- **Owner decisions:** image storage and rights. **Out of scope:** orders, payments, analytics.

### Phase 14 - storefront integration with authoritative catalog (blocked on Phase 13)

- **Objective:** replace the fixture catalog with real data behind the existing accessor seam.
- **Deliverables:** a backend adapter implementing the existing `src/data/` accessor contract; server-side fetching with defined revalidation; explicit handling of unavailable or empty catalog data; demo fixtures retained as a fallback for local development.
- **Dependencies:** Phase 13.
- **Acceptance:** no view component changes are required; price, pack size, brand, category and imagery come from the database; the storefront's existing checks still pass; a backend outage degrades to a stated gap rather than stale or invented data.
- **Verification gate:** parity check between dashboard records and storefront rendering, plus the full existing storefront suite.
- **Risks:** revalidation staleness; accidental client-side fetching of authoritative data.
- **Owner decisions:** none. **Out of scope:** checkout, orders, payments.

### Phase 15 - cart validation and order creation (blocked on Phase 14)

- **Objective:** create real orders with server-side authority and no duplicate risk.
- **Deliverables:** server-validated cart (ids and quantities only, prices recomputed); checkout form with address and contact capture; order creation in a single transaction with an idempotency key; stock decrement through the movement ledger; order confirmation; the existing inert demo checkout replaced.
- **Dependencies:** Phase 14; Phase 10 state machine; and the **customer-authentication decision (D17)**, which must be approved before checkout can be built. (Customer authentication is **not** part of Phase 12: that phase protects the **owner/admin** interface. D12 requires an account before ordering, and D17 governs how customer accounts work.)
- **Acceptance:** a client-submitted price is ignored; concurrent checkout of the last unit cannot oversell; a repeated submission returns the original order; a failed transaction leaves no partial order.
- **Verification gate:** concurrency and idempotency tests, plus negative tests for tampered prices and quantities.
- **Risks:** oversell under concurrency; duplicate orders from retries.
- **Deliverables note:** checkout is reachable only to an authenticated customer (D12). A guest who proceeds to checkout is routed through login/registration with the cart preserved. **Out of scope:** real payment capture, courier booking, refunds.

### Phase 16 - manual payment verification, shipping and order lifecycle (blocked on Phase 15)

- **Objective:** complete the commerce loop from manual payment through to delivery, using the approved manual MFS verification model (`docs/payment-workflow.md`).
- **Deliverables:** the payment-status enum and the order-status enum as separate concerns; the customer payment-instruction and submission flow; the admin verification queue with verify/reject actions; duplicate transaction-reference detection; append-only audit of every payment decision; owner-configured payment methods, recipient details and instructions; delivery zones and charges as settings; manual courier dispatch with a recorded consignment id and status; order status transitions with history; cancellation and refund workflows per approved policy; periodic reconciliation of verified payments against the merchant statement.
- **Dependencies:** Phase 15; approved payment policy (D7-D9) and inventory reservation timing (D11); courier arrangement confirmed.
- **Acceptance:** a customer submission can reach `awaiting_verification` but **never** `verified`; `verified`, `rejected` and `refunded` are reachable only through an authorized administrative action; a repeated verify/reject is a no-op; a duplicate transaction reference is flagged before any decision; every decision is audited with actor, timestamp, decision and reason; a refund restores stock through the movement ledger; order history is complete and append-only.
- **Verification gate:** negative tests attempting to set payment status from the storefront; idempotency tests for repeated decisions; duplicate-reference and amount-mismatch drills; a reconciliation rehearsal against a merchant statement extract.
- **Risks:** verification staffed too slowly, causing customer wait and duplicate payments; a transaction reference reused across orders being counted twice; reconciliation gaps.
- **Approved inputs:** D7 (manual bKash, manual Nagad, COD), D8 (sender number and transaction reference required, no screenshot), the approved D9 rules (24-hour verification maximum, exceptions queue, fake-order findings, cancellation via support, manual refund states, COD approval before dispatch, state separation), and the D11 model decided in Phase 9.
- **Still needed before this phase:** recipient accounts, verifying roles (D10), notification channels, reconciliation cadence, and sufficient-evidence definition.
- **Out of scope:** automated gateways, webhooks, automatic confirmation and automated refunds - **none is authorized**.

### Phase 16b - automated payment gateway (deferred, not scheduled)

Not part of launch. When a gateway is approved, the addition is a signature-verified webhook path and a server-side verification call writing the **same** payment record, status enum and audit trail - not a new subsystem. Required at that point: webhook signature verification, idempotency keyed on the provider event id, amount/currency/reference matching, replay protection and settlement reconciliation. No abstraction is built now, because a provider framework with only one manual path is speculative complexity.

### Phase 17 - analytics on verified data (blocked on Phase 16, design can start earlier)

- **Objective:** give the merchant decision-useful figures derived from real orders.
- **Deliverables:** the charts in `docs/admin-dashboard.md`, each answering a named question; date-range selection with period comparison; BDT formatting in both locales; loading, empty, error and partial-data states; server-side aggregation with caching.
- **Dependencies:** Phase 16 for real data; chart design may begin earlier and is a candidate for parallel work.
- **Acceptance:** every figure reconciles against the order tables; no fabricated or interpolated metric; empty periods render as empty rather than as zero-filled lines; charts remain readable on mobile.
- **Verification gate:** reconciliation tests comparing dashboard aggregates against direct queries, plus accessibility review of chart labels and legends.
- **Risks:** misleading presentation of thin data; over-promising insight from a small sample.
- **Owner decisions:** which metrics matter most. **Out of scope:** third-party analytics products, customer-data export, retention modelling without sufficient data.

### Phase 18 - catalog migration tooling (partly parallel, blocked on Phase 13)

- **Objective:** import the real catalog without hand entry, safely and recoverably.
- **Deliverables:** the staged workflow in `docs/migration-plan.md` - extraction, validation, a mandatory migration report, idempotent and recoverable import, and post-import verification.
- **Dependencies:** Phase 13 for a catalog to import into; owner authorization for any extraction. Can run in parallel with Phases 15-17.
- **Acceptance:** dry-run by default; a repeated import updates rather than duplicates; a failed import leaves the catalog unchanged; every record carries provenance; the report is produced and reviewed before any write.
- **Verification gate:** owner review of the migration report, then a spot-check of imported records against source.
- **Risks:** incomplete or stale source data; unresolved image rights; unreviewed Bangla transliterations.
- **Owner decisions:** extraction authorization and image rights. **Out of scope:** live synchronization with any external system; importing customers or orders.

### Phase 19 - production readiness (blocked on Phases 16-18)

- **Objective:** establish launch quality, security and operational evidence.
- **Deliverables:** closure of the requirements in `docs/security.md`; dependency and build review; rate limits; privacy and retention; safe logging; monitoring and alerts; tested backup and restore; rollback rehearsal; real-device and assistive-technology checks; 200% zoom; constrained-network image loading; Bangla and English content review; image rights clearance; regression evidence; **and measurement of image delivery latency and egress against the Neon Object Storage limits** recorded in `docs/platform-architecture.md` section 8.
- **Dependencies:** a complete system and a production-like environment; business and legal approval for content, image rights, privacy and policies; a named operational owner.
- **Acceptance:** every mandatory security requirement is evidenced or explicitly accepted as a blocker with a documented reason; no critical or high finding remains without an owner-approved disposition; demo safeguards are changed only under explicit launch approval.
- **Verification gate:** full suite against a served build plus authorized security, accessibility and performance checks, recording devices, versions and limitations.
- **Risks:** untested production configuration; third-party failure; unresolved rights or policies.
- **Owner decisions:** launch authorization, policies, operational owner. **Out of scope:** claiming security from frontend checks alone, or launching with unresolved rights.

### Phase 20 - deployment, operations and handoff (blocked on Phase 19)

- **Objective:** release through an owner-approved, reversible deployment and support model.
- **Deliverables:** approved domain, indexing and robots configuration; TLS and security headers; secret provisioning; deployment pipeline; monitoring; runbooks; support and escalation paths; rollback; handoff documentation.
- **Dependencies:** Phase 19 acceptance, hosting and domain access, a named operational owner, and explicit launch authorization.
- **Acceptance:** smoke checks pass; alert, restore and rollback drills succeed; ownership and incident paths are documented; indexability reflects the owner's launch intent (the demo is currently `noindex`).
- **Verification gate:** staged release with post-deploy smoke checks and a monitored rollback rehearsal.
- **Risks:** operational gaps; irreversible customer impact. **Out of scope:** public launch before explicit owner sign-off.

## Parallel work that does not block the critical path

| Work | Can start | Why it is safe in parallel |
| --- | --- | --- |
| Visual review of the Phase 4 logo and Phase 5 layout | Now | Presentation only; no backend dependency |
| Real iOS/Android, screen-reader and 200% zoom checks on the demo | Now | Demo acceptance, independent of the backend |
| Bangla content review of product names | Now | Content task; feeds Phase 18 |
| Image rights clearance | Now | Business task; gates Phase 18 and launch |
| Analytics chart design | During Phase 12-14 | Design does not need real data; only implementation does |
| Catalog migration tooling | During Phases 15-17 | Needs the Phase 13 catalog API, not the commerce loop |
| Admin dashboard UI design | During Phase 12 | Presentation over an already-defined module scope |

Deliberately **not** parallelised: schema design, order creation and payment integration. These share transactional invariants and parallelising them creates rework and integrity risk.

## Frontend-demo milestones versus production-launch requirements

**Demo milestones** (the current application): complete through Phase 5, with demo acceptance items outstanding. These are presentation, content and device checks on an explicitly `noindex` demonstration.

**Production-launch requirements** (everything from Phase 9 onward): a real database, real orders, verified payments, real delivery, customer data protection, and operational readiness. None of it exists yet.

The two must not be conflated in reporting. A passing storefront check says nothing about production commerce readiness.

## Critical path and risks

`Phases 0-8 complete → Phase 9 complete (D1, D2, D3, D7, D8, D9, D11, D12 approved) → Phase 10 schema and security architecture → Phase 11 backend foundation → Phase 12 owner/admin authentication and dashboard foundation → Phase 13 catalog management and API → Phase 14 storefront integration → Phase 15 cart validation, customer authentication and order creation → Phase 16 manual payment, shipping and lifecycle → Phase 17 analytics → Phase 18 migration → Phase 19 readiness → Phase 20 release.`

Phase 9 and Phase 10 are complete, so the critical path now runs through **Phase 11**, which is unblocked but requires explicit owner authorization to begin. All eight blocking decisions are settled, and the schema, state machines and security model are designed. **No resource has been provisioned and no implementation has started.**

The answers shape the plan directly: the **24-hour expiry** and the **one-claim-per-unit bound** fix the schema and transaction shape, while **post-dispatch cancellation** and the **COD lifecycle** fix the order state machine. Owner business rules and asset rights can still block branches earlier.

**No production launch date is promised.** The remaining scope includes external dependencies - merchant arrangements, courier agreements, image rights - that are outside this project's control and are not yet resolved.

## Current single best next step

**Owner: authorize Phase 11 - independent backend foundation.**

**Why this is next:** Phase 10 is complete. The schema, the eight state machines, the transaction and concurrency design, the authorization matrix and the threat model are all documented in `docs/data-model.md` and `docs/security.md`, so the foundation can now be built against a fixed design instead of an evolving one. Building the skeleton before any commerce behaviour is what makes the later phases verifiable rather than speculative.

**Prerequisites:** explicit owner authorization to begin Phase 11; **D14 (ORM/query layer) decided**, because it selects the migration tooling; and confirmation that provisioning is authorized, since Phase 11 is the first phase that creates real resources. No customer or payment credential is needed.

**Acceptance criteria - Phase 11 complete when:**

1. A clean environment can be provisioned from the repository alone, with no manual step that is not documented.
2. Migrations apply from scratch and a rollback is rehearsed successfully against a scratch branch.
3. No secret is committed, and the built client bundle contains no secret material.
4. Typecheck, lint and tests run in CI and are green.
5. The typed data-access layer exists and is the only path to the database, so no view reaches SQL directly.
6. The environment separation rules in `docs/data-model.md` section 16.7 are configured and verified: development, preview and production each have their own endpoint and credential.

**Still required from the owner before implementation of commerce features:** **D17 (customer authentication provider)**, which blocks checkout because D12 requires accounts before ordering; **D10** (verifying roles); and the operational items - recipient accounts, courier and COD settlement terms, notification channels, retention periods, and image rights.

**Explicitly not authorized by this recommendation:** provisioning, deployment, DNS changes, credential creation, or any implementation work. Each requires its own authorization.
