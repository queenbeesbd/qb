# QueenBee's storefront (demo)

A bilingual (Bangla/English) cosmetics storefront for QueenBee's, a Bangladeshi cosmetics retailer. Built as a **client-ready frontend demonstration**: the shopping experience is complete and interactive, with authentic product photography, but no order, payment or delivery is real.

> **Product model (approved 2026-10-11, [ADR 0008](docs/decisions/0008-single-store-product-model.md)).** QueenBee's is a **single-store, owner-operated shop**: one owner sells this store's own goods to this store's own customers. It is **not** a marketplace, multi-vendor platform or SaaS store builder - there are no third-party merchants, vendor onboarding, seller dashboards, commissions, payouts or tenant isolation. The private **admin dashboard** serves this store's owner (and, only where justified and approved, named staff).
>
> **Direction (approved 2026-10-11).** QueenBee's is being built as an **independent e-commerce platform** - its own backend, database, admin dashboard, analytics and commerce workflows. The Zatiq Easy dashboard is a UX and feature reference only, not a target backend or a dependency. See [the decision](docs/decisions/0004-independent-platform-direction.md), [platform architecture](docs/platform-architecture.md), [admin dashboard scope](docs/admin-dashboard.md) and [migration plan](docs/migration-plan.md). None of it is built yet.

- Public catalog source: https://queenbees.sellbd.shop/
- Functional reference (patterns only, no assets copied): https://ghorerbazar.com/
- Merchant backend: https://merchant.zatiqeasy.com/ - **reference only.** Audited read-only in Phase 7 and now explicitly not an integration target

> **This is a demonstration.** A locked announcement strip says so on every route. Checkout is a preview with no form, no payment fields and no submit path. No data leaves the browser. See [Known limitations](#known-limitations).

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
| `/checkout` | Static | Inert demo preview - no form, no payment, no submission |
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

- **Checkout is simulated.** No order, payment, address or customer data is collected, transmitted or stored.
- **Photography rights are not confirmed in writing.** The 22 images were retrieved from the merchant's own public product pages for this same merchant's demo, and are tagged `merchant_source_pending_confirmation`. Public availability is not a licence. See [docs/catalog.md](docs/catalog.md).
- **The merchant's photography is lifestyle-style, not studio packshots** - mixed backgrounds (banana leaf, outdoors, white fur), gloved hands, and occasional watermarks. Normalised with a uniform 3:4 crop and a neutral surface; not hidden.
- **Placeholder fallbacks remain available** for any product without verified, permitted imagery.
- **No "recently added" list.** The public storefront publishes no reliable date-added field. The section was renamed to "More to explore" and is presented as a curated collection rather than a recency claim.
- **The homepage category section is hidden below 720px.** Category discovery on mobile goes through the header drawer, which lists every category. Category filtering and the category routes are unaffected.
- **No product descriptions.** The public pages publish none; the product page says so rather than generating copy.
- **Bangla product names are transliterations** prepared for this demo and require native review.
- **Stock is a snapshot**, not live inventory. It reflects the public listing on the capture date.
- **No backend exists yet.** The merchant platform was audited read-only in Phase 7 and is now a reference only. QueenBee's will own its backend, database and admin dashboard; **none of it is built** - Phase 10 designed it, which is not the same as building it. No price, stock, discount, authorization or payment value from the client is trusted anywhere in this codebase.
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
| D7 | Payment methods | **Manual bKash**, **manual Nagad**, and **COD as a distinct method**. No automated gateway |
| D8 | Payment fields | **Sender mobile number required**, **transaction reference required**, **no screenshot**. Recipient details owner-configurable |
| D9 | Payment and order policy (**approved**) | **24-hour verification maximum** as an internal service maximum, never a customer-facing promise; an exceptions queue so a genuine payment is never silently discarded; fake-order findings with an audited reason and a separate customer review flag; cancellation via support; manual refunds with separate requested/processing/completed/failed states; COD owner approval before dispatch; **24-hour unpaid-order expiry** that never touches an order with a submitted claim; **cancellation after the window** as a pre-dispatch support decision or a post-dispatch return; and the **full COD lifecycle** |
| D11 | Inventory allocation (**approved**) | The **first submitted payment claim gets the product**, and **at most one active submitted claim per unit**. Atomic allocation, no oversell, idempotent release, inspection-before-restoration |
| D12 | Checkout | **Account required.** Guests may browse and build a cart, then must log in or register to order; the cart is preserved and they return to checkout |

Cost policy: keep initial costs as close to zero as reasonably possible, do not upgrade pre-emptively, and recheck provider pricing and plan terms before implementing or recommending an upgrade. The ~$15 and ~$20 figures are the owner's intended future budget, not guaranteed permanent prices.

**Phase 11 is complete, locally.** The database foundation exists: a 39-table Drizzle schema (**40** since Phase 12), reviewed SQL migrations (a generated baseline plus a hand-written guards migration for append-only enforcement, order immutability, state-transition guards and the privileged-permission rule), a server-only typed data-access layer, strict environment validation, migration commands, least-privilege grants, and tests that exercise the schema constraints and the Phase 10 concurrency invariants against real PostgreSQL. See [database foundation](docs/database.md).

**Owner decisions (2026-10-12, [ADR 0009](docs/decisions/0009-owner-decisions-availability-bans-and-owner-accounts.md)).** Product availability is an **owner-controlled In Stock / Out of Stock state**, and an out-of-stock product cannot be ordered. The owner may **ban a customer after a confirmed fake order**, enforced server-side. Administration is **owner-only**: multiple owners are permitted with full access each, and there are no staff or support roles or permission-management system at launch. Owner authentication is **email and password**; **Resend email verification and Google sign-in are deferred** until the client confirms them. Customer/business activity records are kept separate from internal administrative and security records. **[ADR 0010](docs/decisions/0010-availability-toggle-scope.md) closes the remaining question** by scoping availability to a bare owner toggle in Phase 13, and records that this does **not** prevent overselling: whether the approved quantity ledger becomes the allocation backstop is open again and gates order creation (Phase 15).

**Phase 12 (Owner/Admin Authentication & Dashboard Foundation) is implemented locally and is not deployed.** It protects the private administrative interface for this store's owner: owner login with a hashed credential, server-side sessions in an httpOnly cookie with expiry and revocation, owner-issued credential recovery, per-permission enforcement on every admin page and mutation, and an append-only audit trail. Migration `0002` adds `staff_recovery_token` (`docs/data-model.md` 4.9), taking the schema to **40 tables**. **Nothing is deployed and no cloud resource exists.** Customer authentication is a separate decision (D17) and is not part of this phase.

**Phase 13 (Product & Category Management) is implemented locally and is not deployed.** The owner can create and edit products, categories and brands, and operate the **In Stock / Out of Stock** state; the authoritative server-side orderability check refuses an unpublished, archived or out-of-stock product. Owner accounts are managed on a minimal screen with **no role picker** - the role is forced - and the last-active-owner guard is enforced under a row lock. Product imagery is associated from **existing local assets only**, with dimensions and content type read from the file. A database-backed read layer and an authenticated read API exist behind the **unchanged** storefront accessor contract. The Phase 12 staff and role screen, its navigation entry and its four API routes were **removed** and now return 404. Migration `0003` adds `product.availability` (purely additive; schema still **40 tables**), and `npm run verify:admin` passes **97/97**. **Deliberately not done:** the storefront is **not** cut over and still renders the fixture catalog; **no inventory movement, deduction or reservation is written**, so overselling is not prevented; **no image is uploaded** and no object storage exists; there is no public catalog endpoint, and no customer account, checkout or order. See [ADR 0010](docs/decisions/0010-availability-toggle-scope.md) and the [roadmap](docs/implementation-plan.md).

**Nothing is deployed and no cloud resource exists** - no Neon project, branch, database or bucket, and no credential. Provisioning requires separate owner authorization.

**Phase 10 was complete as a design.** [docs/data-model.md](docs/data-model.md) specifies 35 tables with their keys, constraints, indexes, retention rules and authorization boundaries, **eight separate state machines**, the transaction and concurrency design (including the atomic claim-allocation transaction and the 24-hour expiry sweep), the authorization matrix, the image-storage and upload architecture, the authentication architecture, and migration, rollback and operational safety. [docs/security.md](docs/security.md) carries the authorization matrix and a 16-part threat model.

**Nothing is implemented.** No database, migration, dependency, environment change, credential, bucket or deployment exists. One acceptance criterion is deliberately unmet: the concurrency guarantees are **reasoned and structurally constrained but not executed**, because no database exists.

**Phase 11 (independent backend foundation) is unblocked but not started, and requires explicit owner authorization** - including authorization to provision, since it is the first phase that creates real resources. **D17 (customer authentication provider) is newly raised and blocks implementation of checkout.**

The decisions that shaped the design ([payment workflow](docs/payment-workflow.md) sections 13.9 and 13.10.7):

1. **Unpaid-order expiry** - **24 hours from placement**, applying only to orders with no submitted claim. An order awaiting verification never expires automatically.
2. **Cancellation after the window** - support decides before dispatch; after dispatch it becomes a **delivery cancellation / return**.
3. **COD lifecycle** - owner approval before dispatch, the return workflow after, return-to-store on failure, and separate delivery, cash-collection and reconciliation states.
4. **D11 bound** - **at most one active submitted claim per unit**.

**D11 is approved:** the **first submitted payment claim gets the product**. A later claim preempts an earlier **unsubmitted** hold; an order that has submitted a claim is never preempted and never released by a timer, and **at most one active submitted claim exists per unit**. **Accepted consequence:** a losing customer who transferred before submitting must be refunded manually through support, so the storefront claims the unit at submission, before showing payment instructions.

**Binding invariants:** atomic stock checks, no oversell, idempotent state-guarded release, no automatic release for an order whose customer submitted a payment claim, and returned goods restored to sellable only after physical inspection.

**Customer-submitted details are never proof of payment:** an authorized admin must independently verify receipt. **No resource has been provisioned** - no database, no deployment, no domain change. No backend or dashboard has been scaffolded.
