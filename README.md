# QueenBee's storefront (demo)

A bilingual (Bangla/English) cosmetics storefront for QueenBee's, a Bangladeshi cosmetics retailer. Built as a **client-ready frontend demonstration**: the shopping experience is complete and interactive, with authentic product photography, but no order, payment or delivery is real.

> **Product model (approved 2026-10-11, [ADR 0008](docs/decisions/0008-single-store-product-model.md)).** QueenBee's is a **single-store, owner-operated shop**: one owner sells this store's own goods to this store's own customers. It is **not** a marketplace, multi-vendor platform or SaaS store builder - there are no third-party merchants, vendor onboarding, seller dashboards, commissions, payouts or tenant isolation. The private **admin dashboard** serves this store's owner (and, only where justified and approved, named staff).
>
> **Direction (approved 2026-10-11).** QueenBee's is being built as an **independent e-commerce platform** - its own backend, database, admin dashboard, analytics and commerce workflows. The Zatiq Easy dashboard is a UX and feature reference only, not a target backend or a dependency. See [the decision](docs/decisions/0004-independent-platform-direction.md), [platform architecture](docs/platform-architecture.md), [admin dashboard scope](docs/admin-dashboard.md) and [migration plan](docs/migration-plan.md). None of it is built yet.

- Public catalog source: https://queenbees.sellbd.shop/
- Functional reference (patterns only, no assets copied): https://ghorerbazar.com/
- Merchant backend: https://merchant.zatiqeasy.com/ - **reference only.** Audited read-only in Phase 7 and now explicitly not an integration target

> **This is a demonstration.** A locked announcement strip says so on every route, and the site is
> `noindex`. It is **not deployed**. Locally it runs a real backend: customer accounts, Cash on Delivery
> checkout and an owner admin panel. **Cash on Delivery is the only payment method (ADR 0015)** - there is
> no online payment, no gateway and nothing to pay in the browser. See
> [Known limitations](#known-limitations).

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.4.0 (App Router, Turbopack) |
| Language | TypeScript 5.9.3, `strict` + `noUncheckedIndexedAccess` |
| Runtime | Node >= 20.9.0 (verified on Node 26.11.1) |
| Package manager | npm 12.2.0, lockfile committed |
| Styling | CSS Modules + CSS custom-property tokens |
| Rendering | Server Components by default; Client Components only for cart, locale, filters, drawer, shelf |
| Data | Local typed fixtures in `src/data/` (no API calls at runtime) |
| Imagery | 22 product photos served locally as WebP + JPEG at 3:4, two widths; reuse rights pending written confirmation |
| i18n | Central typed dictionaries, `useSyncExternalStore` locale store |
| Fonts | Inter (Latin, variable) + Noto Sans Bengali, self-hosted via `next/font`; weights limited to 400/500/600/700 |
| Tests | Zero-dependency integrity scripts + a CDP-driven Chromium suite (64 checks; last reported pass in Phase 5) |

No database, ORM, auth provider, CMS, state-management library, UI component library or animation library is used. See [ADR 0001](docs/decisions/0001-nextjs-typescript-foundation.md).

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build and serve:

```bash
npm run build
npm run start        # http://localhost:3000
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:catalog` | Content integrity: ids, slugs, prices, categories, image files, provenance, locked demo warning |
| `npm run check:i18n` | Bangla/English key parity and placeholder-token equality |
| `npm run verify:browser` | 64-check Chromium journey suite (requires a running server) |

Browser suite usage:

```bash
npm run build
npx next start -p 4311 &
npm run verify:browser          # defaults to http://127.0.0.1:4311
```

It drives a local Chromium over the DevTools Protocol using only Node built-ins (`node:http` plus the global `WebSocket`), so no test dependency is added. It requires `chromium` on `PATH`; if it is unavailable, run the other five checks and treat browser behaviour as unverified.

## Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | Static | Hero with product composition, desktop-only category section, single-row featured shelf, verified offers, curated "more to explore" collection |
| `/products` | Server-rendered | Search, category/brand filter, sort; all state in the query string |
| `/categories/[slug]` | Server-rendered | Five reviewed categories |
| `/products/[slug]` | Prerendered (22) | Product photos, price hierarchy, quantity, add to cart, related products |
| `/cart` | Static | Quantity editing, removal, derived totals, empty state |
| `/checkout` | Dynamic | Account-gated **Cash on Delivery** checkout: delivery contact and cart lines only, no payment field (D12, ADR 0015) |
| `/_not-found` | Static | Localized not-found |

Search, filter and sort are URL-driven, so every view is linkable, refreshable and back/forward-safe.

## Internationalization

Bangla is the default. The toggle in the header switches the entire interface and persists the choice in `localStorage` under `queenbees.locale.v1`. Interface copy lives in `src/i18n/dictionaries.ts`; components never hardcode text or branch on locale. Product and category content is `{ bn, en }` with a documented per-field fallback. Prices are stored as integer poisha and **never change with locale** - only the digit style and currency prefix do. See [ADR 0002](docs/decisions/0002-bilingual-content-strategy.md).

## Project layout

```
src/
  app/                  routes, layout, shared chrome, global tokens
  components/           header, footer, cards, stepper, icons
  features/catalog/     query parsing, selection, home and catalog views
  features/cart/        cart store, provider, view
  features/checkout/    inert checkout preview
  i18n/                 dictionaries, locale config, store, provider, hook
  lib/                  domain types, integer money, formatting
  data/                 reviewed demo catalog and categories
scripts/                catalog and i18n integrity checks, browser suite
docs/                   audit, requirements, design, security, plan, ADRs
public/brand/           original SVG mark, outlined wordmark, favicon
public/catalog/         22 product image sets (local WebP + JPEG variants)
```

## Known limitations

- **Checkout is real, and Cash on Delivery only.** A signed-in customer places a COD order with a delivery address; the owner approves or cancels it by phone. **No online payment exists** and no gateway is authorized. Nothing is deployed, so any order placed locally is test data.
- **Photography rights are not confirmed in writing.** The 22 images were retrieved from the merchant's own public product pages for this same merchant's demo, and are tagged `merchant_source_pending_confirmation`. Public availability is not a licence. See [docs/catalog.md](docs/catalog.md).
- **The merchant's photography is lifestyle-style, not studio packshots** - mixed backgrounds (banana leaf, outdoors, white fur), gloved hands, and occasional watermarks. Normalised with a uniform 3:4 crop and a neutral surface; not hidden.
- **Placeholder fallbacks remain available** for any product without verified, permitted imagery.
- **No "recently added" list.** The public storefront publishes no reliable date-added field. The section was renamed to "More to explore" and is presented as a curated collection rather than a recency claim.
- **The homepage category section is hidden below 720px.** Category discovery on mobile goes through the header drawer, which lists every category. Category filtering and the category routes are unaffected.
- **No product descriptions.** The public pages publish none; the product page says so rather than generating copy.
- **Bangla product names are transliterations** prepared for this demo and require native review.
- **Stock is a snapshot**, not live inventory. It reflects the public listing on the capture date.
- **No backend is deployed.** The merchant platform was audited read-only in Phase 7 and is now a reference only. QueenBee's owns its own backend, database and admin dashboard: the database foundation, owner authentication, catalog management, the database-backed storefront catalog, customer accounts with atomic order creation, the COD owner queue, the redesigned operations dashboard and **three-area delivery pricing** are **implemented locally (Phases 11-19)**. Customers choose Dhaka, Chattogram or Other districts; the owner sets a required default and optional area charges at Settings → Delivery charges, and each order stores the applied charge as an immutable snapshot. **Courier recording, cash collection/reconciliation and the post-dispatch lifecycle are not built.** The **actual delivery amounts are owner inputs**; until the default is saved, checkout refuses orders rather than guessing. The manual bKash/Nagad flow built in Phase 16 was **removed in Phase 17** ([ADR 0015](docs/decisions/0015-cod-only-release.md)). No price, stock, discount, authorization or payment value from the client is trusted anywhere in this codebase.
- **A plaintext credential sits in the working tree.** An untracked, gitignored `.env` file holds a credential for the withdrawn `merchant.zatiqeasy.com` vendor. No code reads it and it is not committed, but it should be treated as exposed; **rotating it at the provider and removing it from future use is an owner action**. See [docs/security.md](docs/security.md).
- **Not verified:** real iOS Safari and Android Chrome devices, screen reader output on real assistive technology, and any production security control.

## Documentation

- [Agent rules](AGENTS.md)
- [Repository and storefront audit](docs/project-audit.md)
- [Reference pattern analysis](docs/reference-analysis.md)
- [Requirements](docs/requirements.md)
- [Design system](docs/design-system.md)
- [Architecture](docs/architecture.md)
- [Security and threat model](docs/security.md)
- [Demo catalog provenance](docs/catalog.md)
- [Merchant backend capability audit](docs/backend-capability-audit.md) (Phase 7 reference; not an integration target)
- [Platform architecture](docs/platform-architecture.md)
- [Data model and schema architecture](docs/data-model.md)
- [Database foundation and operations](docs/database.md) (Phase 11; implemented locally, not deployed)
- [Admin dashboard scope](docs/admin-dashboard.md)
- [Catalog migration plan](docs/migration-plan.md)
- [Implementation plan](docs/implementation-plan.md)
- [Verified project status](docs/project-status.md)
- [Decisions](docs/decisions/)

## Current state and next step

See [verified project status](docs/project-status.md) and the [implementation plan](docs/implementation-plan.md).

Phases 0-8 are complete. The owner has approved an independent-platform direction, so the previous plan to integrate with the merchant platform is withdrawn.

**Phase 9 is complete: every blocking decision is owner-approved.** The owner has approved ([ADR 0005](docs/decisions/0005-neon-postgresql-and-vercel-hosting.md), [ADR 0006](docs/decisions/0006-neon-object-storage.md), and the [decision register](docs/platform-architecture.md)):

| ID | Decision | Detail |
| --- | --- | --- |
| D1 | Database - **Neon PostgreSQL** | **Free** initially; ~$15/mo upgrade when justified |
| D2 | Hosting - **Vercel** | **Hobby** initially; **Pro** ~$20/mo when required |
| D3 | Image storage - **Neon Object Storage** | Free (5 GB/project); $0.023/GB-month paid. Branches with the database, so preview environments cannot modify production imagery |
| D7 | Payment methods | **Cash on Delivery only** ([ADR 0015](docs/decisions/0015-cod-only-release.md) narrowed the 2026-10-11 decision). No online gateway, no provider, nothing authorized |
| D8 | Payment fields (withdrawn) | The prepaid claim fields - sender number, transaction reference, claimed amount - were **removed with the flow**. Nothing of the kind is collected or stored |
| D9 | Payment and order policy (**approved**; expiry **deferred by ADR 0014**) | **24-hour verification maximum** as an internal service maximum, never a customer-facing promise; an exceptions queue so a genuine payment is never silently discarded; fake-order findings with an audited reason and a separate customer review flag; cancellation via support; manual refunds with separate requested/processing/completed/failed states; COD owner approval before dispatch; **cancellation after the window** as a pre-dispatch support decision or a post-dispatch return; and the **full COD lifecycle**. **A submitted claim never expires or is released by a timer**; the **24-hour unpaid-order expiry is deferred** and no scheduler is added |
| D11 | Payment-claim priority (**approved**; superseded in effect by ADR 0013) | The **first submitted payment claim** is observed first, with **at most one active submitted claim per order**. **No reservation, allocation or deduction is written and overselling is accepted**, so there is no per-unit preemption or release; inspection-before-restoration still governs returned goods |
| D12 | Checkout | **Account required.** Guests may browse and build a cart, then must log in or register to order; the cart is preserved and they return to checkout |
| D17 | Customer authentication (**approved**, ADR 0012) | **First-party customer sessions.** Email and password (**scrypt**, never plaintext); opaque 256-bit session tokens stored only as a **SHA-256 hash**; httpOnly `SameSite=Lax` cookies with idle and absolute expiry; account- and source-keyed throttling; customer-scoped CSRF; **strict separation from owner/admin credentials, sessions and permissions**. **Email is the sole registration and sign-in identifier**; email verification deferred; **no self-service password recovery at launch** (owner-operated reset only). **No external identity, mail, OAuth or SMS provider is authorized** |

Cost policy: keep initial costs as close to zero as reasonably possible, do not upgrade pre-emptively, and recheck provider pricing and plan terms before implementing or recommending an upgrade. The ~$15 and ~$20 figures are the owner's intended future budget, not guaranteed permanent prices.

**Phase 11 is complete, locally.** The database foundation exists: a 39-table Drizzle schema (**40** since Phase 12), reviewed SQL migrations (a generated baseline plus a hand-written guards migration for append-only enforcement, order immutability, state-transition guards and the privileged-permission rule), a server-only typed data-access layer, strict environment validation, migration commands, least-privilege grants, and tests that exercise the schema constraints and the Phase 10 concurrency invariants against real PostgreSQL. See [database foundation](docs/database.md).

**Owner decisions (2026-10-12, [ADR 0009](docs/decisions/0009-owner-decisions-availability-bans-and-owner-accounts.md)).** Product availability is an **owner-controlled In Stock / Out of Stock state**, and an out-of-stock product cannot be ordered. The owner may **ban a customer after a confirmed fake order**, enforced server-side. Administration is **owner-only**: multiple owners are permitted with full access each, and there are no staff or support roles or permission-management system at launch. Owner authentication is **email and password**; **Resend email verification and Google sign-in are deferred** until the client confirms them. Customer/business activity records are kept separate from internal administrative and security records. **[ADR 0010](docs/decisions/0010-availability-toggle-scope.md)** scoped availability to a bare owner toggle in Phase 13. **[ADR 0013](docs/decisions/0013-availability-only-ordering-gate.md) settles the ordering gate (2026-10-15): availability is the only ordering gate**, no reservation, allocation or deduction is written, and **overselling is accepted** rather than prevented. The D11 inventory tables remain implemented and unused.

**Owner decisions (2026-10-17, [ADR 0015](docs/decisions/0015-cod-only-release.md) superseding the payment half of [ADR 0014](docs/decisions/0014-phase-16-checkout-payment-and-delivery-decisions.md)).** **Cash on Delivery is the only payment method in this release.** A COD order enters an **owner-confirmation queue** and the owner confirms by phone before processing - no automatic approval and no courier API. The **bKash/Nagad claim flow, its recipient configuration, its verification queue and its permissions were removed**, and the schema tables they used remain **unused**. **Bans are reasoned, audited and session-revoking and never automatic.** **Delivery charges are not configured:** the amounts, supported areas and matching policy are outstanding owner inputs, so shipping is zero and the interface says delivery is arranged on confirmation. The **24-hour expiry timer and external notifications are deferred**. **Automated online payment is a future roadmap item with no selected provider.** **Recording these decisions provisioned nothing and changed no schema.**

**Owner decisions (2026-10-15, [ADR 0012](docs/decisions/0012-customer-authentication.md) and [ADR 0013](docs/decisions/0013-availability-only-ordering-gate.md)).** Customer authentication is **first-party**: email and password (**scrypt**), opaque 256-bit session tokens stored only as a **SHA-256 hash**, httpOnly `SameSite=Lax` cookies with idle and absolute expiry, account- and source-keyed throttling, customer-scoped CSRF, and strict separation from owner/admin credentials, sessions and permissions. **Email is the sole registration and sign-in identifier**; email verification is deferred; **there is no self-service password recovery at launch** (owner-operated reset only); and **no external identity, mail, OAuth or SMS provider is authorized**. Availability is the **only** ordering gate: no reservation, allocation, deduction or automatic availability change is written, and **overselling is accepted** rather than prevented. **Recording these decisions provisioned nothing** - no dependency, provider, credential, bucket or deployment was created.

**Phase 12 (Owner/Admin Authentication & Dashboard Foundation) is implemented locally and is not deployed.** It protects the private administrative interface for this store's owner: owner login with a hashed credential, server-side sessions in an httpOnly cookie with expiry and revocation, owner-issued credential recovery, per-permission enforcement on every admin page and mutation, and an append-only audit trail. Migration `0002` adds `staff_recovery_token` (`docs/data-model.md` 4.9), taking the schema to **40 tables**. **Nothing is deployed and no QueenBee's-bound cloud resource exists** (see the note below). Customer authentication was a separate decision; **D17 is settled in [ADR 0012](docs/decisions/0012-customer-authentication.md)** and is not part of this phase.

**Phase 13 (Product & Category Management) is implemented locally and is not deployed.** The owner can create and edit products, categories and brands, and operate the **In Stock / Out of Stock** state; the authoritative server-side orderability check refuses an unpublished, archived or out-of-stock product. Owner accounts are managed on a minimal screen with **no role picker** - the role is forced - and the last-active-owner guard is enforced under a row lock. Product imagery is associated from **existing local assets only**, with dimensions and content type read from the file. A database-backed read layer and an authenticated read API exist behind the **unchanged** storefront accessor contract. The Phase 12 staff and role screen, its navigation entry and its four API routes were **removed** and now return 404. Migration `0003` adds `product.availability` (purely additive; schema still **40 tables**), and `npm run verify:admin` passes **97/97**. **Deliberately not done in that phase:** the storefront was **not** cut over and still rendered the fixture catalog; **no inventory movement, deduction or reservation is written**, so overselling is not prevented; **no image is uploaded** and no object storage exists; there is no public catalog endpoint, and no customer account, checkout or order. See [ADR 0010](docs/decisions/0010-availability-toggle-scope.md) and the [roadmap](docs/implementation-plan.md).

**Phase 14 (Storefront Catalog Cutover) is implemented locally and is not deployed.** The storefront now renders the catalog from the **database**, read **server-side only** through the typed accessor contract - there is deliberately **no public catalog endpoint**. Curation is seeded into the existing `collection` / `collection_item` tables rather than a flag on the product record. Search resolves from the product name (both locales), the brand and the pack size; there is no tags feature. The Phase 1 fixture is retained only as the deterministic **local/test seed** (`npm run db:seed:catalog`) and an explicit **development-only** opt-in (`QUEENBEES_STOREFRONT_FIXTURE=1`, off by default, refused outside development, and **never** a fallback after a database read failure - a failure surfaces through the storefront error boundary). An empty catalog states the gap rather than rendering a zero-filled grid. **Unchanged:** availability remains the owner-controlled **In Stock / Out of Stock** state, and this phase writes **no inventory movement, deduction or reservation**. That question is now **settled in [ADR 0013](docs/decisions/0013-availability-only-ordering-gate.md)**: availability is the **only** ordering gate and **overselling is accepted** rather than prevented. **Still not done:** no image upload and no object storage, no public catalog endpoint, no customer account, checkout or order. See [ADR 0011](docs/decisions/0011-local-catalog-authority-and-storefront-cutover.md).

**Phase 15 (Cart Validation, Customer Authentication and Order Creation) is implemented locally and is not deployed.** Customers create an account with an **email and password** (scrypt hashing, never plaintext), sign in to an opaque 256-bit session token stored only as a **SHA-256 digest** in an httpOnly `SameSite=Lax` cookie with a sliding idle limit inside a 30-day ceiling, and are throttled **by account and by source**. **There is no self-service password recovery** - the limitation is stated on the sign-in screen, and no mail, OAuth or SMS provider exists. Ordering requires an account (D12), so an anonymous visitor at `/checkout` is sent to sign in with the checkout path preserved and the browser cart intact. Order creation is **server-authoritative**: the transaction claims a submission key, refuses a suspended or deleted account **inside the transaction** (D20), checks availability per product from database state, prices every line from the database, and writes the order with its items, contact and `order_event` together or not at all; a repeat submission returns the original order and a reused key with a different body is a conflict. The checkout form submits **ids, quantities, contact and a payment method only** - there is no price field, and submitted `priceMinor`/`totalMinor` values are ignored. **No inventory reservation, deduction or movement is written** (ADR 0013), so availability is the only stock gate and **overselling is accepted, not prevented**; an order sits at `awaiting_payment` because payment instructions and verification are Phase 16, and delivery charges remain unapproved so the total is the items subtotal. The schema is **unchanged at 40 tables** - no migration. Verified 2026-10-15: `test` **109/109**, `test:db` **165/165**, `verify:admin` **97/97**, `verify:storefront` **65/65** browser plus **16/16** HTTP customer-flow checks, plus `typecheck`, `lint`, `check:i18n`, `check:catalog`, `check:secrets`, `db:rehearsal` and `build`. **Not done:** no payment flow, no owner-facing customer-ban control, no deployment. See [ADR 0012](docs/decisions/0012-customer-authentication.md) and [ADR 0013](docs/decisions/0013-availability-only-ordering-gate.md).

**Nothing is deployed and no QueenBee's-bound cloud resource exists** - no Neon project, branch, database, role, credential or bucket for this product, and none was created. The only Neon resource reachable from the account belongs to a **different product** and is **out of scope**; do not query or modify it. Neon PostgreSQL remains the approved future direction ([ADR 0005](docs/decisions/0005-neon-postgresql-and-vercel-hosting.md)), and **provisioning it requires its own explicit owner authorization** - approval of a provider is not approval to provision it.

**Phase 10 was complete as a design.** [docs/data-model.md](docs/data-model.md) specifies the tables with their keys, constraints, indexes, retention rules and authorization boundaries, **eight separate state machines**, the transaction and concurrency design, the authorization matrix, the image-storage and upload architecture, the authentication architecture, and migration, rollback and operational safety. [docs/security.md](docs/security.md) carries the authorization matrix and a 16-part threat model. **The inventory reservation tables it designed are implemented and unused (ADR 0013), and the 24-hour expiry sweep is deferred (ADR 0014).**

**Implemented locally (Phases 11-15), deployed nowhere.** The database foundation, owner authentication, catalog management, the database-backed storefront catalog read path, and customer accounts with atomic order creation all exist and are tested against a disposable local cluster. **No database provider resource, credential, bucket or deployment exists for this product**, and provisioning requires its own explicit owner authorization. One Phase 10 acceptance criterion remains deliberately unmet: where a guarantee depends on a resource that does not exist, it is recorded as unexecuted rather than claimed.

The decisions that shaped the design ([payment workflow](docs/payment-workflow.md) sections 13.9 and 13.10.7, and [ADR 0014](docs/decisions/0014-phase-16-checkout-payment-and-delivery-decisions.md)):

1. **Unpaid-order expiry** - **deferred (ADR 0014)**: 24 hours from placement in the design, applying only to orders with no submitted claim, but **no scheduler or expiry job is added** and the binding rule is that a **submitted claim never expires**. Under ADR 0013 there is no reservation to revive.
2. **Cancellation after the window** - support decides before dispatch; after dispatch it becomes a **delivery cancellation / return**.
3. **COD lifecycle** - owner approval before dispatch, the return workflow after, return-to-store on failure, and separate delivery, cash-collection and reconciliation states.
4. **D11 bound** - **at most one active submitted claim per order**, governing the verification queue rather than a contested unit.

**D11 is approved; superseded in effect for launch by ADR 0013:** the **first submitted payment claim** is observed first, and **at most one active submitted claim exists per order**. Because **no unit is reserved or allocated**, there is no per-unit preemption, no release on a timer, and **overselling is accepted** and managed operationally.

**Binding invariants:** availability is the only ordering gate; **no reservation, allocation, deduction or movement is written and overselling is accepted**; a **submitted payment claim is never expired or released by a timer**; no automatic ban or flag follows a rejection or mismatch; prices and totals are computed server-side; and returned goods become sellable again only after physical receipt and inspection.

**Customer-submitted details are never proof of payment:** an authorized owner must independently verify receipt. **No resource has been provisioned** - no provider database, no deployment, no domain change. The backend and admin surfaces that exist are **local only**.
