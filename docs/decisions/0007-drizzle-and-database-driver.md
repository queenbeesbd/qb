# 0007 - Drizzle ORM, drizzle-kit and the database driver

- **Status:** Accepted (owner decision, 2026-10-11)
- **Supersedes:** nothing. Resolves **D14** and the driver question raised in the Phase 11 preflight.
- **Related:** `docs/data-model.md` (the schema this implements), ADR 0005 (Neon PostgreSQL), ADR 0006
  (Neon Object Storage), `docs/platform-architecture.md` section 11 (decision register).

## Context

Phase 10 designed the schema but left the ORM/query layer open as **D14**, deferred to Phase 11 because
it selects the migration tooling. Phase 11 cannot write a migration baseline without it.

The approved schema (`docs/data-model.md`) is unusually constraint-heavy on purpose. Its safety comes
from the database, not from application discipline:

- **Partial unique indexes** - `UNIQUE (order_id) WHERE state = 'submitted'` (the D11 one-active-claim
  bound), `UNIQUE (product_id) WHERE is_default`, `UNIQUE (method) WHERE is_active`,
  `UNIQUE (customer_id, kind) WHERE revoked_at IS NULL`, and several more.
- **CHECK constraints carrying business rules** - `CHECK (reserved <= on_hand)` (the oversell
  backstop), `CHECK (expires_at = placed_at + interval '24 hours')` (the approved expiry duration),
  `CHECK (state <> 'completed' OR (... evidence_note IS NOT NULL))` (a refund cannot be marked
  complete without evidence), and the D9 actor/reason requirements on `payment_claim`.
- **Triggers** - column immutability on `order` and `order_item`, append-only enforcement, and state
  transition guards.
- **Privileges** - `inventory_movement`, `order_event` and `audit_event` are append-only by grant.
- **Interactive transactions** - the D11 claim-allocation transaction locks a balance row, counts
  competing claims, and decides, all while holding the lock.

## Decision

**Drizzle ORM + drizzle-kit**, pinned to mutually compatible stable releases in the `0.45.x` ORM line.
No release candidate.

**Driver: `@neondatabase/serverless` `Pool` over WebSockets** for the deployed runtime, so interactive
transactions are available. The HTTP query function is **not** used for the claim-allocation
transaction, because Neon's own documentation states that HTTP supports "single or **non-interactive**
batched queries" only, while "session or interactive transaction support ... use WebSockets".

**Local development and integration tests use `pg` (node-postgres) against local PostgreSQL 18.6.**

## Why Drizzle

1. **Owned SQL is the normal path.** Partial unique indexes, CHECK constraints, triggers and grants are
   not expressible in every schema DSL. Drizzle treats SQL migrations as first-class, so these live in
   reviewed, version-controlled SQL instead of an escape hatch that drifts from the model.
2. **Typed access without a single source of truth problem.** The schema DSL gives typed queries while
   remaining an accurate description of the database, including partial indexes and CHECKs.
3. **Fewest dependencies.** Two runtime packages (`drizzle-orm`, `@neondatabase/serverless`) plus `pg`,
   against a project that currently has three runtime dependencies in total.
4. **First-party Neon support.** `drizzle-orm/neon-serverless` is a documented integration, and
   `neon-http` / `neon-serverless` are separate entrypoints, which makes the driver choice explicit
   rather than accidental.

## Considered trade-offs (Prisma)

Prisma was evaluated and is a legitimate choice. It has the **larger ecosystem, more mature tooling
(Studio, broader documentation) and greater hiring familiarity**. Those are real advantages and the
main reason to choose it.

It was not chosen because:

- Its schema DSL cannot express partial unique indexes or CHECK constraints, so every one of the
  constraints listed above would be hand-written SQL **outside** the model. `prisma migrate` then
  drift-checks the database against a model that does not represent them - friction landing precisely
  where correctness matters most.
- Its `latest` CLI tag was a **release candidate** at evaluation time (`8.0.0-rc.22`), so adopting it
  today means explicitly pinning to the previous stable line.

**If a concrete incompatibility with Drizzle is discovered, this decision reopens.** It is not reopened
for preference.

## Consequences

- **Migration workflow:** TypeScript schema files under `src/db/schema/`, migrations generated as SQL
  into `drizzle/` by `drizzle-kit generate`, plus **custom (hand-written) migrations** created with
  `drizzle-kit generate --custom` for triggers and grants. Generated SQL is reviewed before it is
  committed; it is never applied unreviewed.
- **No automatic down-migrations.** Drizzle does not generate them. The strategy is **forward-fix**,
  consistent with `docs/data-model.md` section 16.8. Rollback is a rehearsed restore, not a reversed
  migration.
- **The schema baseline is `0001`** - the full approved 39-table design in one reviewed step, with no
  compatibility window, because the database does not exist yet.
- **Migration state is tracked** in Drizzle's `drizzle.__drizzle_migrations` table.
- **Behavioral differences between local PostgreSQL and Neon** are documented in
  `docs/database.md`; the driver is selected behind one server-only module so no calling code depends
  on which is in use.

## Not decided here

Cloud provisioning. This ADR selects tooling; it does not authorize creating a Neon project, branch,
database or bucket. That requires separate explicit owner authorization.
