# Architecture

Status: the implementation as of **2026-10-29** (through Phase 45b). This describes what exists, not a
proposal. Decisions live in `docs/decisions/`; the table and state design lives in
[`data-model.md`](data-model.md); the authorization matrix and threat model in [`security.md`](security.md).

## Applied stack

Next.js 16.4.0 (App Router), React 19.3.0, TypeScript 5.9.3 in strict mode with `noUncheckedIndexedAccess`,
npm with a committed lockfile, CSS Modules plus CSS custom-property tokens, Server Components by default.
PostgreSQL 18 through Drizzle ORM 0.45.4 with reviewed SQL migrations in `drizzle/`.
[ADR 0001](decisions/0001-nextjs-typescript-foundation.md), [ADR 0007](decisions/0007-drizzle-and-database-driver.md).

No UI kit, state-management library, chart library, mail provider, OAuth provider or payment SDK is used,
and none may be added without an owner decision. Charts are hand-drawn SVG ([ADR 0021](decisions/0021-promo-codes-and-analytics.md)).

## Surfaces

| Surface | Routes | Rendering | Session |
| --- | --- | --- | --- |
| Storefront | `/`, `/products`, `/categories`, `/cart`, `/checkout`, `/account` | Server Components, `force-dynamic` (the catalog is live) | none, or the customer session cookie |
| Admin | `/admin/**` | Server Components reading the owner session, one permission check per page and per mutation | httpOnly owner session cookie |
| API | `/api/**` | Route handlers only, every write goes through one | same cookies, plus CSRF for customer posts |

Every route is rendered on demand; the only prerendered output is the generated `/_not-found` and error
pages. There is **no public catalog endpoint**: the storefront reads the catalog server-side only
([ADR 0011](decisions/0011-local-catalog-authority-and-storefront-cutover.md)).

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/lib/` | Domain types (`CatalogItem`, `CartLine`, `Money`, `DeliveryArea`), integer-poisha money, delivery quoting, promo evaluation, search normalisation, price/slug validation, password length policy. No React, no database, no framework imports. |
| `src/server/catalog/` | The typed accessor contract the views depend on (`getStorefrontCatalog`, `checkOrderability`), backed by SQL. |
| `src/server/orders/` | Order creation and the owner transitions: approve, cancel, dispatch, deliver, failed delivery, return, inspect, record payment, record cost. One transaction each. |
| `src/server/auth/` | Owner credentials (scrypt), sessions, CSRF, throttling, recovery tokens, audit writes. |
| `src/server/authz/` | Permission and role data, actor resolution, `requirePermission`, owner-account management. |
| `src/server/customer-auth/` | Customer registration, sign-in, sessions and the owner-issued credential reset. Separate tables, cookie and CSRF label from the owner surface. |
| `src/server/delivery/`, `src/server/promotions/`, `src/server/settings/`, `src/server/analytics/` | Delivery charges, promo rules, store settings, derived dashboard figures. |
| `src/server/integrations/` | Telegram order alerts - advisory, env-only, failures swallowed in `after()` ([ADR 0022](decisions/0022-telegram-order-notifications.md)). |
| `src/db/` | `client.ts` (the only connection), `schema/` (Drizzle), `migrate.ts`, `validate.ts`, seeds. |
| `src/features/` | The `'use client'` views: catalog browsing, cart, checkout form, account forms. |
| `src/components/` | Presentational chrome: header, footer, tab bar, product card, photo, stepper, ticker, icons. |
| `src/data/` | The deterministic fixture seed (`db:seed:catalog`) and the curation id lists. Never a fallback. |
| `src/i18n/` | One English dictionary and the translation hook; `check:i18n` enforces completeness. |

Dependency direction is one-way: `app` -> `features` -> `components`/`lib`; `app` -> `server` -> `db`.
`src/db/` and `src/server/` are server-only, and the environment module throws if it is pulled into a
browser bundle.

## Data flow

### Storefront read path

```text
request -> storefront layout (force-dynamic)
   -> getStorefrontCatalog()   (cache-wrapped: the page and its metadata share one read)
      -> categories, products, curated selections  ---> props ---> Server Components
                                                                    |
                                          'use client' views <-------+
```

Views never import SQL. They receive plain JSON-serialisable values and depend on the accessor contract, so
the source behind it can change without touching a view.

### Cart

```text
localStorage  queenbees.cart.v1   ids + quantities (the cart)
cookie        qb_cart             a mirror of those ids, so a server page can project products
```

The cart provider receives **ids only** from the layout; the badge counts stored quantities without a
product lookup, and a restored line is validated against the ids the shop still sells. The two routes that
draw lines - `/cart` and `/checkout` - read the `qb_cart` mirror, validate every id against the catalog
and project only those products (`selectCartProducts`). That is why a product page carries no catalog and
these two pages carry a basket rather than a shop (Phase 45, 45b).

The mirror carries ids and nothing else, so it is untrusted in the strong sense: a forged value can change
which products a page mentions, and cannot add a line, change a price or place an order. If the cart and the
mirror disagree, `useCartProjection` writes the mirror from the live cart, refreshes the server tree once,
and - if the gap survives - says so instead of drawing a short cart or enabling an order that would omit a
line.

### Checkout write path

```text
form post -> /api/checkout/order
   -> same-origin check (guest) / session + CSRF (customer)
   -> one transaction:
        claim idempotency key
        refuse a suspended or deleted account (D20)
        orderability per product from database state (D19, ADR 0013)
        price every line from product_variant, resolve delivery charge, evaluate the promo code
        write order + order_item + order_contact + order_event, discount snapshot
   -> redirect to the order confirmation
```

Nothing the browser sends is authoritative except ids, quantities, contact fields and a promo string. **No
reservation, deduction or movement is written**, so overselling is accepted by decision
([ADR 0013](decisions/0013-availability-only-ordering-gate.md)).

### Admin write path

```text
/admin/** page  -> resolve session -> requirePermission(page permission)
/api/admin/**   -> same-origin -> session -> CSRF -> requirePermission -> service (re-checks) -> audit
```

Authorization is checked twice on purpose, and the second check is what makes a caller that forgets the
first fail closed. Denials are written in their own transaction, so a refusal cannot roll back its own
record. The audit trail is append-only, enforced by revoked grants and a trigger.

## State model

| State | Server snapshot | Client snapshot | Persistence |
| --- | --- | --- | --- |
| Cart (`src/features/cart/cart-store.ts`) | frozen empty list | restored lines | `localStorage` `queenbees.cart.v1`, mirrored to the `qb_cart` cookie |
| Everything else | - | - | Server-side; `useSyncExternalStore` is used for the cart only |

There is no locale store: the interface is English only (Phase 28). Persisted browser values are treated as
untrusted on read: the cart filters against known ids, de-duplicates, clamps quantities to 1-20 and caps at
40 lines; the cookie mirror validates id shape, de-duplicates and caps at the same 40 ids.

## Database

47 tables, 14 reviewed migrations, least-privilege grants, and append-only enforcement on `order_event`,
`order_item`, `audit_event` and `inventory_movement` (revoked `UPDATE`/`DELETE` plus a
`BEFORE UPDATE OR DELETE` trigger, so it holds regardless of role). Money is integer poisha everywhere.
Five separate state concepts are never collapsed: fulfilment, prepaid payment (retained, unused), COD,
refund (retained, unused) and the inventory reservation (retained, unused).

Derived figures are `sum()`/`count(*)` over rows on read - there is no counter to double-count. Money is
bucketed by `completed_at` and workload by `placed_at`, both in `Asia/Dhaka`, and the interface labels
which is which.

## Trust boundaries

```text
Untrusted: browser, URL, localStorage, cookies, product copy, request bodies
    |
    v
Server:  session -> permission -> service -> one transaction -> database constraints and triggers
    |
    v
Trusted, NOT PROVISIONED: Neon PostgreSQL, Neon Object Storage, Vercel (architecture approved only)
```

- Ownership comes from the session, never from a request parameter; another customer's order number is a 404.
- Hiding a control is never the control: every mutation re-checks permission server-side.
- A submitted artefact is never proof of payment; COD collects none.
- Secrets come from the process environment. No secret is in the repository, a fixture, a log or a
  `NEXT_PUBLIC_*` variable, and `check:secrets` verifies the built bundle.
- No cloud resource for this product exists, and provisioning is a separate owner authorization.

## Environment and execution

One Node process serves both surfaces and the route handlers. Database connections go through
`src/db/client.ts` (`withTransaction` for anything that writes). Telegram alerts run in `after()` so a
notification failure can never fail an order. There is no scheduler, no worker and no background queue:
nothing expires, sweeps or releases anything on a timer, by decision.

## What is not here

Deployment, DNS, object storage, image upload, email/SMS/OAuth providers, online payment, courier
consignment, refunds and traffic analytics. Each is either an owner decision that has not been taken or an
authorization that has not been given; none is implied by anything in this repository.
