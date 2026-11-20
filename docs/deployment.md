# Deployment (Coolify, Docker, from GitHub)

**Authority: `docs/decisions/0045-self-hosted-vps-deployment.md`.** That ADR is the deployment decision -
host, database, volumes, proxy, webhook, the migration gate and the verification it carried. This document
does not restate it. It covers the **day-to-day rule a commit must satisfy**, which is what the working
notes in `AGENTS.md` point at, and it explains the two parts of the image a normal change can quietly
break.

Read ADR 0045 for: the host, the Coolify application, PostgreSQL as a Coolify database, the volumes, TLS,
the auto-deploy webhook, and the evidence that the rollout works.

## What a commit must satisfy

**A push to `main` builds the image and rolls the container.** So a commit is not done when it typechecks;
it is done when the image it produces can serve that code.

| The change | What it needs in the same commit |
| --- | --- |
| application code only | nothing - `COPY . .` and `npm run build` carry it |
| a new dependency | nothing *if it has prebuilt binaries for glibc*; add a system package if it needs one |
| a new dependency needing a system library | the `apt-get install` line in the runner stage |
| a **new runtime path** the app writes to or reads | that path in the runner's `COPY`/`mkdir`/`chown` |
| a new CLI the deploy calls | it must live under `src/` or `scripts/` (both are copied), not a new top-level directory |
| a new migration | the migration **applied to production** before the push - see below |

## The image

A three-stage build from the repository's `Dockerfile`:

| Stage | What it does |
| --- | --- |
| `deps` | `npm ci` from `package.json` + `package-lock.json` |
| `builder` | `npm run build` (which runs the `prebuild` migration gate) |
| `runner` | the app and its runtime files, dropping to `node`, `EXPOSE 3000`, `npm start` |

- **Debian `-slim`, not Alpine**, because `sharp` ships glibc prebuilds.
- **Dev dependencies stay** in the image on purpose: the deploy's migration commands go through `tsx`.
- **`curl` and `ca-certificates` are installed** before dropping privileges - the health check shells out
  to one of them, and the mail/SMS clients need a CA bundle.
- The runner carries `package.json`, `package-lock.json`, `node_modules`, `.next`, `next.config.ts`,
  `tsconfig.json`, `public`, `src`, `scripts` and `drizzle`. **`src` and `scripts` are runtime**, not
  decoration: `db:migrate` and the explicit `check:migrations` call import from them.

### Paths the image creates, and what holds their bytes

| Path | Holds | Bytes live in |
| --- | --- | --- |
| `public/catalog` | product, category, brand and review images | a Docker volume |
| `public/hero` | hero banners | a Docker volume |
| `.data/payment-proof` | private payment screenshots (ADR 0042) | a Docker volume |

All three are excluded from the build context (`.dockerignore`) and **created** by the image so the app
can write on first use. The bytes are volumes, mounted at `/app/...` - a container replacement must not
lose them, and a build must not carry a developer's local uploads into production.

**This is the list to extend.** A commit that adds a directory the application writes to, or a file the
server reads outside `.next`, must add it to the Dockerfile's `COPY`/`mkdir`/`chown` in the same commit.
That failure is invisible locally and only appears in production, after the deploy has already replaced
the running container.

## The migration gate

The application's `pre_deployment_command` runs `npm run check:migrations` **in the running container**, so
a pending migration refuses the rollout. That is the protection the Vercel build had, moved to the new
host (ADR 0045, point 5).

It does **not** apply anything. The sequence is therefore unchanged and mandatory:

1. `npm run db:status` against the target, or `npm run check:migrations` in the container.
2. Apply the pending migrations (`npm run db:migrate` inside the container, where `DATABASE_URL` already
   exists - never write the connection string into a shell, a ticket or a commit).
3. `npm run db:validate`.
4. **Then** push, because the push is what deploys.

If a migration cannot reach production before the push, do not push that commit. The gate will refuse the
rollout and the previous container stays live - which is the intended failure, not an obstacle to route
around.

## Checking a change against the image

Where a Docker daemon exists:

```bash
docker build -t queenbees .
docker run --rm -p 3000:3000 --env-file .env queenbees
curl -fsS http://localhost:3000/ > /dev/null
```

Where it does not - **this workstation has no `docker`** - the image itself cannot be built or run here.
Say so in the report and do not claim a container check that was not run. What can still be verified
locally is the application: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:admin`
against a served build, and whatever narrow check the change calls for.

## What is not in this repository

A Coolify API token, a server address, an SSH key, a volume definition or a domain setting. They live in
the Coolify UI and are not committed. Do not invent them, and do not add them to a file to "make the
deploy reproducible".