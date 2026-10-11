# Database foundation

Status: **Phase 11 implemented locally, 2026-10-11.** The schema, migration workflow, data-access
layer, environment validation and tests exist and pass. **Nothing is deployed**, no cloud resource has
been provisioned, and no credential has been created. See `docs/project-status.md`.

This document explains how the database foundation works and how to operate it. The schema itself is
specified in `docs/data-model.md`; this file covers the mechanics around it.

---

## 1. What Phase 11 built

| Component | Location | Purpose |
| --- | --- | --- |
| Schema (39 tables) | `src/db/schema/*.ts` | The approved design, expressed in Drizzle's PostgreSQL schema DSL |
| Baseline migration | `drizzle/0000_baseline_schema.sql` | Generated SQL creating the whole schema |
| Guards migration | `drizzle/0001_guards_and_privileges.sql` | Hand-written: triggers, append-only enforcement, transition guards |
| Connection layer | `src/db/client.ts` | Server-only. The only place a connection is created |
| Environment validation | `src/server/env.ts` | Server-only. Validates and fails safely |
| Migration runtime | `src/db/migrate.ts` | Applies migrations and reports status |
| Schema validator | `src/db/validate.ts` | Checks a live database against the migration files |
| Least-privilege grants | `src/db/grants.ts` | Re-runnable grant/revoke posture |
| CLI | `scripts/db.ts` | `status`, `migrate`, `validate`, `grants` |
| Disposable cluster | `scripts/local-pg.ts` | Throwaway local PostgreSQL for tests and rehearsals |
| Tests | `tests/unit/`, `tests/db/` | Configuration, schema integrity, constraints, concurrency |

**Not built, deliberately:** any query or repository layer for storefront features, authentication,
checkout, order creation, payment handling, admin surfaces, background jobs, and any deployment. Those
belong to later phases. Phase 11 is the foundation, not commerce behaviour.

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
| Deployed runtime | `@neondatabase/serverless` `Pool` over WebSockets | The D11 claim-allocation transaction is **interactive**; Neon's HTTP driver is explicitly non-interactive only |

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

## 9. Known limitations

- **Nothing is deployed.** No Neon project, branch, database or bucket exists. No credential has been
  created. Cloud behaviour - cold start, pooler semantics, branch isolation, backup/restore, latency
  from Singapore to Bangladesh - is **unverified**.
- **No application feature uses the database yet.** The storefront still reads its fixture catalog. The
  seam between them is a later phase.
- **RLS, CSP, rate limiting and monitoring do not exist.** Phase 10 designed controls; Phase 11 built
  the schema and access foundation, not those controls.
- **The concurrency tests exercise the schema and the guarded statements, not the full commerce
  workflow.** Order creation, claim submission and the expiry sweep as complete operations belong to
  later phases. What is proven here is that the constraints and guards they depend on actually work.
- **`queenbees_app` does not exist anywhere yet**, so the grant posture has never been exercised
  against a role that is not the owner.
