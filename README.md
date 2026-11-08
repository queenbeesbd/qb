# QueenBee's

A **single-store, owner-operated shop** ([ADR 0008](docs/decisions/0008-single-store-product-model.md)): one
storefront on the public web and one private admin panel for the owner who runs it. Next.js App Router
over PostgreSQL, with the catalog, customers, orders, promotions and analytics owned by this repository -
Zatiq Easy was a UX reference, not a backend ([ADR 0004](docs/decisions/0004-independent-platform-direction.md)).

**Status: implemented locally, deployed nowhere.** No cloud resource, credential, bucket or DNS record
exists for this product, and provisioning is a separate owner authorization
([ADR 0005](docs/decisions/0005-neon-postgresql-and-vercel-hosting.md)). The storefront carries a global
`noindex`, and **Cash on Delivery is the only payment method** ([ADR 0015](docs/decisions/0015-cod-only-release.md)) -
nothing is paid in the browser.

## What exists

**Storefront** - the shop, on the real catalog (1,605 products, 15 categories, 245 brands):

- Home, listing with search / category / brand / sort and pagination, category index and detail, product
  detail, cart, checkout.
- Customer accounts: register, sign in, order history and one order's confirmation.
- Checkout is Cash on Delivery: delivery contact plus a delivery area (Dhaka / Chattogram / Other), priced
  server-side and snapshotted on the order. Guest checkout is an owner switch.
- Cart state is ids and quantities in `localStorage`; prices, names and availability are always re-read.

**Admin panel** (`/qbpanel`, owner-only - [ADR 0009](docs/decisions/0009-owner-decisions-availability-bans-and-owner-accounts.md)):

- Overview with the COD worklist, refused actions and catalog counts; `/qbpanel/analytics` for the last
  7 / 30 / 90 days, derived from the shop's own rows.
- Orders: the COD queue, the recallable order list, one order in full with its event history; approve,
  cancel, dispatch, deliver, record a failed delivery, receive the return, mark Payment Received (which
  completes the order) and record per-order courier costs.
- Catalog: products (create, edit, availability, image association), categories, brands.
- Customers, promo codes, delivery charges, announcement bar, integrations, audit trail, owner accounts.

**Not built, deliberately:** any online payment or gateway, courier consignment/tracking, refunds (owner
decision), image upload or object storage, email/SMS/OAuth providers, customer self-service password
recovery, and deployment.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.4.0 (App Router), React 19.3.0 |
| Language | TypeScript 5.9.3, `strict` + `noUncheckedIndexedAccess` |
| Database | PostgreSQL 18 locally; Drizzle ORM 0.45.4 with committed SQL migrations ([ADR 0007](docs/decisions/0007-drizzle-and-database-driver.md)) |
| Styling | CSS Modules plus CSS custom-property tokens in `src/app/globals.css` |
| Interface language | English only, one typed dictionary ([Phase 28](docs/implementation-plan.md)) |
| State | Two `useSyncExternalStore` modules (cart, locale) - no state library |
| Tests | `node:test` unit and database suites, integrity scripts, and CDP-driven Chromium suites |

## Getting started

Local PostgreSQL is a disposable cluster outside the repository (`./.dev-pg`), started by a script.

```bash
npm install
npm run dev:db                 # cluster on 127.0.0.1:55432, matching .env.local

npm run db:migrate             # 16 reviewed migrations, 50 tables
npm run db:seed                # permission catalogue + owner role
npm run db:seed:catalog        # optional: the 22-product fixture seed

npm run staff:bootstrap -- you@example.test "Owner"   # prints a one-time token
# open http://localhost:3000/qbpanel/redeem, paste the token, choose a password

npm run dev                    # http://localhost:3000  (admin at /qbpanel)
```

The production build is what the project verifies: `npm run build` then `npm run start`. Both read
`.env.local` (or `.env`) when present and never override a variable that is already set in the
environment. `QUEENBEES_ENV` guards the database target: a loopback host is refused in production mode,
so a local demo runs as `QUEENBEES_ENV=development`.

**A demo owner account exists in this local database** (`demo@queenbees.test`) - its password was set
through `/qbpanel/redeem` and is not recorded in the repository, because a working credential does not
belong in a committed file. To work on a fresh database, use `staff:bootstrap` above. Accounts are only
created from the host shell or by an owner; there is no web setup screen and no second provisioning
channel.

## Routes

| Route | Notes |
| --- | --- |
| `/` | Hero, curated selections, derived discounts, "recently added", browse row |
| `/products` | Search, category / brand filters, sort, pagination - all in the query string |
| `/products/[slug]` | Product detail, availability, quantity, add to cart |
| `/categories`, `/categories/[slug]` | Department index and one department |
| `/cart` | Lines, quantity editing, removal, derived totals |
| `/checkout` | Delivery contact and area, promo code, Cash on Delivery |
| `/account`, `/account/login`, `/account/register`, `/account/recover` | Customer session and the owner-issued reset |
| `/account/orders`, `/orders/[orderNumber]` | The customer's own order list, and the receipt for one order. The receipt is the canonical route for **both** viewers: a guest reaches it by its own number, a customer through the list, and another customer's number is a 404. `/account/orders/[orderNumber]` redirects to it. |
| `/qbpanel` | Overview: COD worklist, refused actions, catalog counts |
| `/qbpanel/orders-cod`, `/qbpanel/orders`, `/qbpanel/orders/[orderNumber]` | The COD queue, order history, one order in full |
| `/qbpanel/catalog`, `/qbpanel/catalog/new`, `/qbpanel/catalog/[productId]` | Products: list and full-height editor |
| `/qbpanel/categories`, `/qbpanel/promo-codes`, `/qbpanel/customers` | Taxonomy, codes and the customer list |
| `/qbpanel/analytics`, `/qbpanel/audit`, `/qbpanel/owners` | Derived figures, the audit trail, owner accounts |
| `/qbpanel/settings/{delivery,announcement,other,integrations}` | Delivery charges, announcement bar, checkout switches, integrations |
| `/api/...` | Every mutation: checkout, account, and the `/api/qbpanel/*` routes behind a session and a permission |

The admin surface uses **one control scale** (40px / 34px, and 40px for both on a phone) and the
storefront **never lets a phone zoom the page** - see [design system](docs/design-system.md).

## Project layout

```
src/
  app/
    (storefront)/        public routes and their layouts
    (admin)/qbpanel/     owner routes: (app) shell and (auth) login/redeem
    api/                 route handlers - every write goes through one
    globals.css          design tokens; Shell.tsx / providers.tsx wrap both surfaces
  components/            header, footer, tab bar, cards, photo, stepper, icons, ticker
  features/              catalog, cart, checkout, account - the 'use client' views
  lib/                   domain types, integer-poisha money, delivery, promo, search, formatting
  server/                server-only services: auth, authz, catalog, orders, delivery, promotions,
                         settings, analytics, integrations, customer-auth
  db/                    the only database client, Drizzle schema, migrations driver, seeds
  data/                  the deterministic fixture seed and the curation id lists
scripts/                 migration, seed, import, purge, integrity and verification scripts
drizzle/                 reviewed SQL migrations (0000-0015)
docs/                    architecture, data model, security, plan, status, ADRs
public/                  brand assets and the catalog image variants
android-app/             the owner's Android app (Capacitor shell around /qbpanel), its APK in dist/
```

`android-app/` is **not** `app/` on purpose: Next.js resolves a root-level `app/` directory as its own
route directory ahead of `src/app/`, which would replace this whole application with an empty tree.

`src/server/` and `src/db/` are server-only: a client component importing one fails the build, and
`npm run check:secrets` verifies the shipped bundle holds no server path or credential. Views depend on
the accessor contract in `src/server/catalog/storefront.ts`, not on SQL.

## Data

50 tables in 16 reviewed migrations, with append-only `order_event`, `order_item`, `audit_event` and
`inventory_movement` enforced twice (revoked grants and `BEFORE UPDATE OR DELETE` triggers). The state
machines are designed in [data model](docs/data-model.md) and implemented in `src/db/schema/`.

Current local contents: **1,605 products**, **528 customers**, **15 categories**, **245 brands**,
**1,919 images**, **0 orders**. The imported order history was removed by an explicit owner decision
([migration notes](docs/migrations/zatiq-easy-import.md)); the schema, checkout and COD workflow were kept,
so dashboards start empty on this database and fill as orders are placed.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Development server / production build / serve the build |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run test` / `test:db` | Unit suite / database suite (real PostgreSQL) |
| `npm run check:catalog` | Fixture, curation and image-variant integrity |
| `npm run check:i18n` | Dictionary completeness and that no interface file carries Bengali |
| `npm run check:secrets` | No tracked env file, no server path or secret in the client bundle |
| `npm run dev:db` | Start (or `-- --stop`) the local cluster |
| `npm run db:migrate` / `db:validate` / `db:status` / `db:check` / `db:grants` | Apply, validate, report |
| `npm run db:seed` / `db:seed:catalog` / `db:seed:delivery` | Permissions and owner role / fixture catalog / sample delivery charges |
| `npm run staff:bootstrap` / `staff:list` | Create the first owner (one-time token) / list accounts |
| `npm run import:zatiq` | Re-run the captured vendor import (`-- --reset` to truncate first) |
| `npm run db:purge:imported-orders` | Guarded removal of imported order history (`-- --confirm`) |
| `npm run verify:admin` / `verify:storefront` / `verify:browser` | Rendered-behaviour suites (Chromium over CDP) |

## Verification

Run at every phase checkpoint: `typecheck`, `lint`, `check:catalog`, `check:i18n`, `check:secrets`,
`test`, `test:db` and `build`, plus the browser suites against a served build.

**Current, verified 2026-10-29:** unit **200/200**, database **258/258**, `typecheck`, `lint` (0 errors),
`check:i18n` (1,249 keys), `check:catalog`, `check:secrets`, `build`, and a served production build
answering on every storefront and admin route.

**Stale, and known to be:** `verify:browser` and `verify:admin` are written against the 22-product
fixture seed and the ordering/COD fixtures of Phases 14-42; against this imported catalog and an empty
order table their expectations no longer match. Fixing them is the recommended next phase. Their
replacement for now is a set of task-specific CDP probes, which is weaker than a suite that runs every time.

## Known limitations

- **Nothing is deployed.** A real customer cannot reach this build.
- **Image rights are not cleared.** Every imported photograph is tagged
  `merchant_source_pending_confirmation`; public availability is not a licence ([catalog](docs/catalog.md)).
- **Cash on Delivery only**, and the owner confirms by phone before dispatch. No online payment, no
  gateway, no provider credential.
- **Refunds are out of scope** (owner decision) - the table and its states exist, nothing writes them.
- **No courier integration**, no consignment record, no statement reconciliation. The owner records costs
  by hand and the dashboard derives figures from rows rather than counters.
- **No image upload** and no object storage; product images are associated from local assets whose
  metadata is read from the file bytes.
- **No traffic or page-view analytics** - there is no tracker, so the analytics screen says so instead of
  estimating.
- **No self-service password recovery** for customers; the owner issues a one-time code from the customer
  screen. No mail provider is authorized.
- **Not verified:** real iOS Safari, Android Chrome, screen readers, and production security controls.

## Documentation

- [Architecture](docs/architecture.md) - what runs where, trust boundaries, data flow
- [Data model](docs/data-model.md) - tables, constraints, state machines, transactions
- [Security](docs/security.md) - authorization matrix and threat model
- [Design system](docs/design-system.md) - tokens, control scales, surfaces, phone rules
- [Admin dashboard](docs/qbpanel-dashboard.md), [payment workflow](docs/payment-workflow.md)
- [Implementation plan](docs/implementation-plan.md) and [verified status](docs/project-status.md)
- [Decisions](docs/decisions/), [agent rules](AGENTS.md)
