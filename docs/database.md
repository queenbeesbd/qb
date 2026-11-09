# Database foundation

Status: **Phase 11 implemented locally, 2026-10-11; the Phase 14 storefront catalog read path added
2026-10-15.** The schema, migration workflow, data-access layer, environment validation and tests exist
and pass. **Nothing is deployed**, no QueenBee's-bound cloud resource has been provisioned, and no
credential has been created. See `docs/project-status.md`.

This document explains how the database foundation works and how to operate it. The schema itself is
specified in `docs/data-model.md`; this file covers the mechanics around it.

---

## 1. What Phase 11 built (and what Phase 12 added)

| Component | Location | Purpose |
| --- | --- | --- |
| Schema (42 tables) | `src/db/schema/*.ts` | The approved design, expressed in Drizzle's PostgreSQL schema DSL |
| Baseline migration | `drizzle/0000_baseline_schema.sql` | Generated SQL creating the whole schema |
| Guards migration | `drizzle/0001_guards_and_privileges.sql` | Hand-written: triggers, append-only enforcement, transition guards |
| Staff recovery migration | `drizzle/0002_staff_recovery_token.sql` | Generated: `staff_recovery_token`, the owner-issued staff credential path (Phase 12, `docs/data-model.md` 4.9). Takes the schema to **40 tables** |
| Availability migration | `drizzle/0003_product_availability.sql` | Generated (Phase 13): adds `product.availability` with its `CHECK` constraint, the partial index the orderability gate reads, and nothing else. **Purely additive** - no column dropped, no table rewritten, and the inventory tables are untouched. Table count is unchanged at **40** |
| Delivery-charge migration | `drizzle/0004_district_delivery_charges.sql` | Generated (Phase 19, ADR 0016): `delivery_setting`, `delivery_district_charge`, and a nullable `order_contact.district_code` with its format `CHECK`. Additive only; historical orders untouched. Takes the schema to **42 tables** |
| Pricing-rules migration | `drizzle/0017_pricing_rules.sql` | Generated (2026-11-08, ADR 0029): eleven additive columns on `delivery_setting` (three switches, the conditional minimum and its three area rates, the two repeat rates, and the repeat-discount percent and minimum) with their range `CHECK`s. No table added, none dropped; an existing row keeps its default charge and every optional rule defaults to off. Table count is unchanged at **51** |
| Email account-security migration | `drizzle/0018_customer_email_change.sql` | Generated (2026-11-08, ADR 0030): `customer_email_change` (one pending address change per customer), and one new value on the `customer_session.revoked_reason` check (`email_change`). Additive; takes the schema to **52 tables** |
| Product delivery-charge migration | `drizzle/0021_smooth_sandman.sql` | Generated (2026-11-10, ADR 0034): three nullable integer columns on `product` (`delivery_chattogram_minor`, `delivery_dhaka_minor`, `delivery_others_minor`) with non-negative `CHECK`s. Additive only; every existing product keeps NULL, which means the store's configured charge still applies. Table count is unchanged at **52** |
| Catalog read path | `src/server/catalog/read.ts`, `src/server/catalog/storefront.ts` | Server-only. The storefront's catalog read accessor and the loader that decides which source produced a record (section 9) |
| Catalog seed (local/test) | `src/db/seed-catalog.ts`, `scripts/seed-catalog.ts` | Deterministic, idempotent reproduction of the 22-product fixture catalog for local/test verification. **Not a migration** (section 9) |
| Connection layer | `src/db/client.ts` | Server-only. The only place a connection is created |
| Environment validation | `src/server/env.ts` | Server-only. Validates and fails safely |
| Migration runtime | `src/db/migrate.ts` | Applies migrations and reports status |
| Schema validator | `src/db/validate.ts` | Checks a live database against the migration files |
| Least-privilege grants | `src/db/grants.ts` | Re-runnable grant/revoke posture |
| CLI | `scripts/db.ts` | `status`, `migrate`, `validate`, `grants` |
| Disposable cluster | `scripts/local-pg.ts` | Throwaway local PostgreSQL for tests and rehearsals |
| Tests | `tests/unit/`, `tests/db/` | Configuration, schema integrity, constraints, concurrency |

**Not built in Phase 11, deliberately:** any query or repository layer for storefront features,
authentication, checkout, order creation, payment handling, admin surfaces, background jobs, and any
deployment. Later phases add the administrative surfaces and the storefront catalog read path
(sections 1 and 9). **Phases 12-15 have since added owner authentication, catalog management, the
database-backed storefront catalog read path, customer authentication and atomic order creation**; the
remaining commerce loop - prepaid payment instructions and verification, delivery charges, and the
post-dispatch lifecycle - is still absent, and **the 24-hour expiry sweep is deferred (ADR 0014) and is
not a launch priority.** Phase 11 is the foundation, not commerce behaviour.

---

## 2. Decisions

### Drizzle ORM and drizzle-kit (ADR 0007)

Chosen because this schema's safety comes from the database - partial unique indexes, CHECK
constraints, triggers and grants - and Drizzle treats owned SQL migrations as the normal path rather
than an escape hatch. Prisma's larger ecosystem and tooling are recorded as a considered trade-off.
Pinned exactly: `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11. No release candidate.

### Driver

| Context | Driver | Why |
| --- | --- | --- |
| Local development, tests, migrations | `pg` (node-postgres) | Works against a local cluster and Neon's pooled TCP endpoint |
| Deployed runtime | `@neondatabase/serverless` `Pool` over WebSockets | The claim-submission and order-lifecycle transactions are **interactive**; Neon's HTTP driver is explicitly non-interactive only. (The originally cited D11 *allocation* transaction is unused at launch - ADR 0013 - but the requirement is unchanged.) |

The driver is chosen in exactly one place (`src/db/client.ts`, via `src/server/env.ts`), so no calling
code depends on which one is in use. `DATABASE_DRIVER` can override the inference.

### Behavioural differences between local PostgreSQL and Neon

Documented rather than assumed away. None of these changes the schema, but they matter in operation:

| Difference | Consequence |
| --- | --- |
| Connection method | Local uses TCP; Neon uses WebSockets over the pooler. A WebSocket global must exist (Node 22+). |
| Cold starts | Neon scales to zero, so the first query after idle is slower. Local has no equivalent. |
| Pooler semantics | Neon's pooled endpoint is PgBouncer-style. Session-level state (advisory locks, `SET`) behaves differently, so the design avoids relying on session state and uses row locks inside transactions instead. |
| SSL | Local uses `trust`; remote requires TLS. The validator refuses `sslmode=disable` on a remote host. |
| Server version | Local is PostgreSQL 18.6; the Neon branch version is whatever the project is created with and must be checked at provisioning time. |
| `fsync` | The disposable test cluster disables it for speed. Never a production setting. |

---

## 3. Environment configuration

Required and optional variables are documented in **`.env.example`** with placeholders only. No real
value appears in this repository.

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string for **this** environment |
| `DATABASE_DRIVER` | no | `pg` or `neon-serverless`. Inferred from the host when unset |
| `QUEENBEES_ENV` | no | `development` \| `test` \| `preview` \| `production`. Defaults to `NODE_ENV` |
| `QUEENBEES_ALLOW_REMOTE_TEST_DB` | no | Test-only escape hatch. When unset, tests refuse any non-local host |
| `QUEENBEES_STOREFRONT_FIXTURE` | no | Storefront only. `1` opts the storefront into the Phase 1 fixture catalog **in a development environment only**; any other value, or any other environment, keeps the database source. Read directly by the loader rather than through `serverEnv()`, so it works with no database configured, and **refused outside development** (ADR 0011) |

### Fail-safe behaviour

`src/server/env.ts` refuses to start, with an actionable message, when:

- `DATABASE_URL` is absent, empty, not a URL, or not a `postgres:`/`postgresql:` scheme;
- a remote host is configured with `sslmode=disable`;
- `QUEENBEES_ENV=production` points at a loopback host;
- `QUEENBEES_ENV` or `DATABASE_DRIVER` holds an unrecognised value.

It also **throws if imported into a client bundle**, so a database URL cannot reach browser code even
by accident. `npm run check:secrets` verifies the built client bundle contains no server-only marker.

### Environment isolation

Each environment must have **its own endpoint and credential**. Development and tests use a disposable
local cluster; preview and production would each get their own Neon branch, endpoint and credential.
This is a rule, not a convention: `assertDisposableDatabase()` refuses to run tests against a
non-local host unless explicitly overridden.

**Residual risk, stated plainly:** Neon credentials are lineage-bound, not environment-bound. A preview
environment *misconfigured* with production values would still reach production. Branch isolation
protects data, not configuration (ADR 0006). A deployment check is the mitigation, not a guarantee.

---

## 4. Migration workflow

### Creating a migration

```bash
# After editing src/db/schema/*.ts
npm run db:generate -- --name=describe_the_change
```

This writes SQL into `drizzle/`. **Read the generated SQL before committing it.** Then:

```bash
npm run db:check      # migration history is internally consistent
npm run db:status     # what is applied, pending, or unrecognised
npm run db:migrate    # apply
npm run db:validate   # the live database matches the migration files
```

### Hand-written SQL

Triggers, grants and anything else the schema DSL cannot express go in a **custom migration**:

```bash
npx drizzle-kit generate --custom --name=describe_the_change
```

That creates an empty registered file to fill in. `drizzle/0001_guards_and_privileges.sql` is the
worked example. Registration matters: an unregistered `.sql` file is never applied.

### Rules

1. **Applied migrations are never edited.** A mistake is fixed by a new migration. Editing applied
   history is how environments silently diverge - and `npm run db:status` reports an applied
   migration whose hash matches no current file, which is the signal that this happened.
2. **Forward-only.** Drizzle does not generate down-migrations and this project does not hand-write
   them. Recovery is a rehearsed restore (section 6), not a reversed migration.
3. **Generated SQL is reviewed.** It is not applied straight from a tool run.
4. **Migrations do not need a credential to generate.** `drizzle-kit generate` is offline; only
   applying needs a connection.

### Rollout sequencing for later changes

Expand, then migrate, then contract - never a destructive change in the same step as the code change
(`docs/data-model.md` section 16.2). Additive changes are preferred because a rollback then needs no
data migration.

**A production deploy does not apply migrations.** `npm run build` and Vercel's build step touch no
database, so a deployment can carry code that reads a table the target database does not have. The
sequence is: `npm run db:status` against the target (it prints every pending migration by name),
`npm run db:migrate`, `npm run db:validate` (50 tables), **then** deploy the code. Applied history is
per database, so a migration that is applied locally is not applied anywhere else.

That sequence was skipped once and cost a live screen: migration `0015_free_thunderbolt` (the
`visit_session` / `visit_event` tables, ADR 0027) was deployed in code on 2026-11-06 but not applied to
the production database, so `/qbpanel/analytics` failed with `relation "visit_session" does not exist`
while every other admin page loaded, and order creation refused at the visit-log update. It was applied
on 2026-11-07. Recorded in `docs/project-status.md`.

### Rollback

There is no automatic down-migration. The practical options, in order of preference:

1. **Forward-fix** with a new migration. Always preferred.
2. **Restore** from a backup or a Neon branch, when data was affected. This is why a restore rehearsal
   is an acceptance criterion rather than an afterthought.
3. **Do not** hand-edit the database to "undo" a migration. The migration history would no longer
   describe the database, and `db:validate` would fail - correctly.

---

## 5. Least-privilege grants

`npm run db:grants` applies the grant posture in `src/db/grants.ts` to the role `queenbees_app`:

- `SELECT, INSERT, UPDATE, DELETE` on all tables, and sequence usage;
- then `UPDATE, DELETE` **revoked** on `inventory_movement`, `order_event`, `audit_event` and
  `order_item`.

The role is **not created by this project**. Creating a login role and its credential is provisioning,
which Phase 11 does not authorize. Where the role does not exist the command is a no-op and says so.

**Why the append-only guarantee does not depend on the grant alone.** A grant does not restrain the
table owner, and in local development and tests the application connects as the owner. The grant would
therefore be untestable exactly where it is exercised. So append-only is enforced **twice**:

1. by a `BEFORE UPDATE OR DELETE` trigger that raises, which holds regardless of role; and
2. by the revoked privileges, which is defence in depth for a deployed least-privilege role.

**Not claimed:** row-level security. At launch the boundary is server-side authorization plus these
grants. RLS remains a documented future hardening step.

---

## 6. Backup and restore

**Not verified, and not verifiable locally.** Backup, point-in-time restore and branch restore are
properties of the Neon project, which does not exist yet. What Phase 11 establishes is only the
*rehearsal procedure*:

1. Create a disposable cluster: `startLocalCluster()` in `scripts/local-pg.ts`.
2. Apply migrations to it from empty.
3. Dump it (`pg_dump`), drop the database, restore the dump, and re-run `db:validate`.

That exercise is meaningful because it proves the schema can be rebuilt from the repository alone. It
is **not** evidence that a Neon backup or restore works. That check requires a provisioned project and
a separate authorization.

---

## 7. Local development and clean-environment setup

```bash
# 1. Install
npm ci

# 2. Start a disposable cluster and print a connection string
npx tsx -e "import('./scripts/local-pg.ts').then(async (m) => { const c = await m.startLocalCluster('queenbees_dev'); console.log(c.url); console.log('press Ctrl+C to stop'); process.on('SIGINT', async () => { await c.stop(); process.exit(0); }); });"

# 3. Point the app at it
echo 'DATABASE_URL=<the printed url>' > .env.local

# 4. Apply the schema
npm run db:migrate
npm run db:validate
```

A clean environment is reproducible from the repository alone: the schema lives in version control, and
nothing outside it is needed to build the database.

### The stable development cluster (Phase 20)

The one-liner above is right for a single session. For day-to-day work there is a script, so the cluster
survives between commands at the port `.env.local` already points at:

```bash
npm run dev:db            # start (or report) the cluster on 127.0.0.1:55432
npm run db:migrate
npm run db:seed           # permission catalogue and the owner role
npm run db:seed:catalog   # the 22-product catalog
npm run staff:bootstrap -- you@example.test "Owner"   # one-time token, redeemed at /qbpanel/redeem
npm run dev

npm run dev:db -- --stop  # stop it; the data directory is kept, nothing is deleted
```

Its safety properties are the point of it: the data directory is **outside the repository**
(`$TMPDIR/queenbees-dev-pg`, overridable with `QUEENBEES_DEV_PG_DIR`), `initdb` runs **only when no
cluster exists** - an existing data directory is started, never re-initialised - the database is created
**only when absent**, and the server listens on loopback only. It has no code path that can address a
remote host.

**Scripts and `.env.local` (changed in Phase 20).** `db:migrate`, `db:validate`, `db:status`,
`db:grants`, `db:rehearsal`, `db:seed`, `db:seed:catalog`, `staff:bootstrap`, `staff:list` and
`check:catalog` now run with `--env-file-if-exists=.env.local --env-file-if-exists=.env`. Before this,
the documented workflow (write `DATABASE_URL` into `.env.local`, then `npm run db:migrate`) failed with
"DATABASE_URL is required", because only the Next.js runtime read that file. An **exported** variable
still wins over the file, so the disposable-cluster test harness and the verification scripts are
unaffected.

---

## 8. Tests

| Command | What it covers |
| --- | --- |
| `npm run test` | Unit: environment validation, schema/migration drift, invariant presence in SQL |
| `npm run test:db` | Integration against a disposable local PostgreSQL: migration application and idempotency, catalog validation, every constraint, and the concurrency invariants |
| `npm run test:all` | Both |

Database tests **skip with an explicit message** when the PostgreSQL server binaries are unavailable,
rather than passing silently. A skipped run is reported as skipped.

The tests that matter most are the concurrency ones in `tests/db/concurrency.test.ts`. They exist
because Phase 10 recorded its D11 guarantees as **reasoned but unexecuted** (its acceptance criterion
A14). Exercising them against real PostgreSQL is what converts that claim into evidence.

---

## 9. Storefront catalog reads and the local seed (Phase 14)

The storefront obtains its catalog **server-side only**, through the typed read accessor
`src/server/catalog/read.ts`, projected into the source-agnostic view shape by
`src/server/catalog/storefront.ts`. The rules that shape it:

- **One snapshot per request.** The loader is wrapped in React `cache()`, so the layout, the page and the
  cart read **one** catalog snapshot per request rather than one query each. The read runs inside a
  single transaction.
- **Server-only.** The loader transitively imports `src/db/client.ts`, which throws if it reaches a
  browser bundle. No view component imports it; the catalog reaches the client views as serializable
  **props**.
- **Dynamic rendering.** The storefront routes declare `force-dynamic`, so a production build performs
  **no** database access.
- **Source discriminator.** Every record carries `source: 'database' | 'fixture'`, so a fixture record
  can never be presented as a database record, or the reverse.
- **No public endpoint.** There is **no** unauthenticated catalog HTTP route (ADR 0011). The only HTTP
  catalog surface is the authenticated admin read API.
- **Empty, not faked.** An empty catalog is returned as empty and stated in the interface; a read failure
  propagates to the storefront error boundary rather than substituting the fixture.

### The local/test seed

`npm run db:seed:catalog` (`scripts/seed-catalog.ts`) reproduces the 22-product Phase 1 fixture as rows,
so the cutover can be verified against the catalog the fixture described. It is **idempotent** - every
insert is keyed on a natural key and skipped when the row exists; it never truncates and never rewrites a
row the owner has edited - and **deterministic**, using one fixed timestamp with no `Date.now()` and no
randomness. It runs in **one transaction**, so a failure leaves no partial catalog.

**Seeding is not a migration.** It is not in `drizzle/`, it is not run by `db:migrate`, it is not part of
the applied migration history, and `db:validate` does not see it. It is **local/test only**, and the
seeded parity is a **verification aid**: it is not a claim that the fixture is production data.

Recorded deviations from the fixture (`src/db/seed-catalog.ts`): two products that publish no brand attach
to a single documented `unbranded` placeholder, because `product.brand_id` is `NOT NULL`; availability maps
to `out_of_stock` for anything other than an exact `in_stock` (the fail-safe direction); every image row
records `rights_status: pending_confirmation`; and `product_image_derivative` is not populated.

---

## 10. Known limitations

- **Nothing is deployed.** No Neon project, branch, database or bucket exists for this product. No
  credential has been created. Cloud behaviour - cold start, pooler semantics, branch isolation,
  backup/restore, latency from Singapore to Bangladesh - is **unverified**.
- **The commerce loop is only partly built.** Phases 12-15 added owner authentication and catalog
  management, the database-backed storefront catalog, customer accounts and atomic order creation
  (all **local, undeployed**). There is still **no prepaid payment instructions/verification, no
delivery charge and no post-dispatch lifecycle**. **No inventory movement, deduction or reservation is
  written** and **overselling is accepted** rather than prevented (ADR 0013).
- **RLS, CSP, rate limiting and monitoring do not exist.** Phase 10 designed controls; Phase 11 built
  the schema and access foundation, not those controls.
- **The concurrency tests exercise the schema and the guarded statements, not the full commerce
  workflow.** Claim submission and the remaining lifecycle operations belong to later phases, and **the
  expiry sweep is deferred (ADR 0014)**. What is proven here is that the constraints and guards they
  depend on actually work. Order creation is now covered by the Phase 15 database tests.
- **`queenbees_app` does not exist anywhere yet**, so the grant posture has never been exercised
  against a role that is not the owner.
