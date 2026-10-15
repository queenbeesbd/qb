# ADR 0011 - Local catalog authority and the storefront cutover

- Status: accepted (owner-decided, 2026-10-15)
- Extends: ADR 0005 (Neon PostgreSQL and Vercel hosting), ADR 0008 (single-store product model),
  ADR 0010 (availability toggle scope).
- Supersedes: the Phase 14 expectation of a **public** catalog read endpoint recorded in ADR 0010 and in
  `docs/implementation-plan.md`, and the roadmap wording "demo fixtures retained as a fallback for local
  development".
- Related: `docs/data-model.md`, `docs/database.md`, `docs/catalog.md`, `docs/security.md`,
  `docs/platform-architecture.md`.

## Context

Phase 13 gave the owner a real catalog - products, categories, brands, imagery association and the
In Stock / Out of Stock availability toggle - and a database-backed read layer
(`src/server/catalog/read.ts`) reachable through an authenticated admin API. It deliberately did **not**
cut the storefront over: the public storefront still read the Phase 1 in-repo fixture through
**synchronous** accessors (`src/data/catalog.ts` and `src/data/curation.ts`) that six `'use client'`
components import at module scope. A client component cannot import `src/server/` or `src/db/`.

Phase 14 performs the cutover: the storefront's catalog becomes the **database**, read **server-side
only**, against a **local** PostgreSQL cluster.

Two questions had to be answered first, and neither is a coding question.

**First: is there a remote database to read?** The approved provider direction is Neon PostgreSQL
(ADR 0005), and the roadmap assumed a hosted catalog. Before implementing, the Neon resources reachable
from the account were inspected to decide whether provisioning was even needed.

**Second: how much public surface does the storefront need?** The roadmap had reserved a **public**
catalog read endpoint for this phase, without naming a consumer.

The owner's answers are recorded below, together with one scope boundary that follows from the
inspection finding rather than from a decision about the product.

## Decision

**The storefront's catalog is the database, read server-side only, on a local, disposable PostgreSQL
cluster. Phase 14 is implemented locally and nothing is deployed.**

### 1. Remote-database scope is settled by an inspection finding, not by provisioning

The only Neon resource reachable from the account is a **different product's** accounting/inventory
database (177 products, 32 brands, 53 categories). A probe for QueenBee's-bound data returned **zero
rows**. The owner placed that project and all its branches, databases and data **out of scope**: it must
not be queried or modified further.

The honest conclusion:

- **No QueenBee's-bound remote database exists, and none was created.**
- **No cloud resource was provisioned** - no Neon project, branch, database, role, credential or bucket.
- **Neon PostgreSQL remains the approved future provider direction** (ADR 0005). Approval of a provider
  is not approval to provision it, and provisioning requires its own explicit owner authorization.
- Phase 14 therefore runs against a **local, disposable PostgreSQL** cluster only.

### 2. No public catalog endpoint

Phase 14 adds **no** unauthenticated catalog HTTP route. The storefront reads the database through the
typed, **server-only** accessor contract (`src/server/catalog/read.ts`, projected by
`src/server/catalog/storefront.ts`) inside server components, and passes **serializable props** to the
client views. A public catalog endpoint with no consumer would be a new unauthenticated attack surface
added without a requirement.

The read accessor must not change when such a surface is ever added: the seam is designed so the
transport can change without any view component changing.

### 3. The fixture is never a fallback

The Phase 1 fixture catalog survives in exactly two roles:

1. the **seed input** for local/test parity (section 4); and
2. an **explicit, development-only opt-in**, enabled only by the environment variable
   `QUEENBEES_STOREFRONT_FIXTURE=1`.

The opt-in is **off by default**; it is **refused outside a development environment** (the loader
**raises** rather than warns, because a captured vendor catalog served from test, preview or production
would publish someone else's data as this store's own); and it is **never used after a database read
failure** - a read failure propagates to the storefront error boundary, so a broken database can never
silently become a stale fixture catalog.

This **supersedes** any earlier roadmap wording such as "demo fixtures retained as a fallback for local
development".

### 4. Seeding for parity

All **22** fixture products are seeded **idempotently and deterministically** into the local/test
database, so the storefront can be verified against the same catalog the fixture described: the same
slugs, prices, pack sizes, categories, image keys and curation selections. Seeding is **local/test
only**, runs in one transaction, keys every insert on a natural key, and never truncates or rewrites a
row the owner has since edited.

**The seeded parity is a verification aid, not a claim that the fixture is production data.** Three
deviations are recorded rather than hidden:

- `product.brand_id` is `NOT NULL`, but two fixture products publish no brand; they are attached to a
  single documented placeholder brand (`unbranded`) rather than inventing a brand per product or
  dropping the product.
- Fixture availability is `'in_stock' | 'out_of_stock' | 'unknown'`; the database admits only the first
  two, and anything not exactly `'in_stock'` maps to `'out_of_stock'` (the fail-safe direction, D19,
  ADR 0010).
- Every seeded image records `rights_status: pending_confirmation`. The fixture photography remains
  tagged `merchant_source_pending_confirmation` and is **not cleared for public launch by this ADR** -
  written confirmation from the rights holder is still outstanding.

Seeding is **not a migration** and is not part of the applied migration history.

### 5. Search has no tags feature

Storefront search is derived from the **product name (both locales)**, the **brand** and the
**pack/size descriptor** only. There is **no tags feature, and none is planned**. `description` is not
searched. The Phase 1 fixture carried a `tags` array; it is **not** part of the catalog model and is not
reintroduced.

### 6. Curation is still an id list, never a flag on a product record

The featured and secondary selections now live in the **database** (`collection` + `collection_item`,
addressed by item **position**) rather than in `src/data/curation.ts`. The fixture's declared caps
(featured **6**, secondary **8**) and the requirement that the two selections are pairwise disjoint with
the derived deals set are **unchanged**. `src/data/curation.ts` is retained only as seed input. No
`featured` boolean is reintroduced on the product record.

### 7. Availability is unchanged from Phase 13

The owner-controlled **In Stock / Out of Stock** state remains the only storefront gate (D19, ADR 0010).
Phase 14 writes **no** inventory movement, deduction or reservation, so **overselling is not prevented**.
This remains an **open question** - it is not softened here - and it still gates order creation
(Phase 15).

### 8. Cutover mechanics

- **Storefront routes are rendered dynamically** (`force-dynamic`), so a build performs no database
  access.
- **One catalog snapshot is read per request** and shared by the layout and the pages (the loader is
  wrapped in React `cache()`).
- **A view component never knows which source produced a record.** Records carry an explicit
  `source: 'database' | 'fixture'` discriminator, so the two can never be confused.

### 9. Empty is stated, never faked

An empty catalog or an empty category is **reported in the interface**. It never becomes a zero-filled
grid and never falls back to fixture rows. The existing error boundary remains the outcome of a read
failure.

## Consequences

- **The storefront's catalog is authoritative database state**, maintained by the owner through the
  Phase 13 admin surface. The Phase 1 fixture is demoted to a seed and a development-only opt-in.
- **No public catalog endpoint, and therefore no new public surface.** The typed accessor seam is
  preserved so the transport could change later without touching a view component.
- **The storefront's checks now depend on a seeded database** (`build`, `verify:browser`,
  `check:catalog`) where they previously did not. Seeding is local/test only and is not a migration.
- **The fixture photography rights tag is unchanged.** Seeded images carry
  `rights_status: pending_confirmation`, and the product photography is still **not** cleared for public
  launch - this ADR clears nothing.
- **No commerce behaviour is added.** No order, no payment, no customer account, no inventory movement.
- **A build performs no database access**, because the storefront routes are dynamic.

## Alternatives considered

- **Provision a Neon project and read the hosted catalog.** Rejected: no QueenBee's-bound data exists to
  read, and provisioning requires its own explicit owner authorization. A local disposable cluster
  achieves the same verification without creating a resource.
- **Add a public catalog read endpoint for parity with the roadmap wording.** Rejected: an
  unauthenticated surface with no consumer is exposure added without a requirement. The read accessor is
  unchanged if such a consumer ever appears.
- **Keep the fixture as an automatic fallback on a database error.** Rejected: silent degradation would
  present stale captured vendor data as current catalog state. A read failure must surface as a stated
  gap, not a substituted catalog.
- **Search a `tags` array.** Rejected: no tags model exists in the approved schema, and inventing one
  would publish keywords nobody verified.
- **Point a development/preview environment at a shared remote database.** Rejected: Neon credentials
  are lineage-bound rather than environment-bound (ADR 0006), and isolation depends on each environment
  having its own endpoint and credential.

## Open questions

- **Does overselling matter, and does the toggle sit over the quantity ledger?** **Settled (ADR 0013,
  2026-10-15):** availability is the only ordering gate; no reservation, allocation or deduction is
  written, and overselling is **accepted** rather than prevented.
- ~~D17 (customer authentication provider)~~ **Settled (ADR 0012, 2026-10-15):** first-party customer
  sessions with **no self-service recovery** and no external provider, so it no longer blocks checkout.
- **Is a public catalog endpoint ever needed?** Only with a named consumer; the seam is ready and
  no endpoint is authorized now.
- **When, if ever, is the platform provisioned?** No cloud resource exists and none was created; that is
  a separate owner authorization.

## What this does not authorize

No provisioning, deployment, DNS change, credential or bucket creation, no object storage, no image
upload, no public/unauthenticated endpoint, no change to the D11 reservation design, and no deletion of
the inventory tables. **Nothing is deployed.**
