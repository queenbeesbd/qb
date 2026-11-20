# ADR 0045 - Production runs on the owner's VPS with Coolify

Status: accepted (owner direction, 2026-11-20). Supersedes the **hosting half of ADR 0005** (Neon
PostgreSQL and Vercel) and the **runtime half of ADR 0006** (Neon Object Storage) for production. The
data model, the append-only guarantees, the COD-only release, the single-store product model and every
authorization rule are unchanged.

## Context

The owner rents one RackNerd KVM VPS - Ubuntu 24.04, 2 vCPU, 2.5 GB RAM, 30 GB disk - and wants the
storefront, owner panel, database and uploaded images to run there instead of Vercel plus Neon. The
motivation is ownership and predictable cost: one box, one bill, no serverless filesystem, no egress
allowance that can suspend the shop.

The application is already shaped for this move. `src/db/client.ts` is the only connection constructor;
`DATABASE_DRIVER` resolves to `pg` for any non-Neon host; uploads already write WebP variants to disk
when writable; `public/catalog` and `public/hero` are generated trees; and the migration gate is a
build-time command, not a Vercel API call.

## Decision

1. **One host, Coolify 4.7.6.** Coolify manages Docker, the application, the database and the proxy.
   Traefik terminates TLS with Let's Encrypt. The storefront is `https://www.queenbeesbd.com` (apex
   301s to www); the dashboard is `https://coolify.queenbeesbd.com`. No separate Caddy is installed.
2. **PostgreSQL 17 is a Coolify database, not a host package.** It runs as `queenbees-db` with a
   generated password, a persistent volume, a daily `pg_dump` schedule, and TLS enabled. The app reaches
   it by container name on the Coolify network. The application URL uses `sslmode=no-verify` because
   Coolify's internal CA is not in Node's trust store; the connection is still encrypted and never
   leaves the host. Mounting the Coolify CA into the app is the hardening step, not a launch blocker.
3. **Uploaded bytes are local persistent volumes.** `public/catalog`, `public/hero` and
   `.data/payment-proof` are Docker volumes mounted into the app at `/app/...`. `CATALOG_ASSET_BASE_URL`
   is unset: Next serves the mounted files directly. This removes Neon Object Storage from the runtime.
   The bucket's duplicate JPEG objects are a separate cleanup and are not referenced.
4. **A repository Dockerfile is the build contract.** Node 22 Debian slim (glibc for `sharp`), `npm ci`,
   `npm run build`, `next start` on 3000 as the unprivileged `node` user, with `curl` and
   `ca-certificates` installed for Coolify's health check and outbound provider calls.
   `public/catalog` and `public/hero` are excluded from the build context because they are mounted.
5. **Push to `main` deploys.** Coolify auto-deploy is on, and a GitHub push webhook points at
   `https://coolify.queenbeesbd.com/webhooks/source/github/events/manual` with Coolify's own webhook
   secret. A push builds a new image and performs a rolling replacement. The application's
   `pre_deployment_command` runs `npm run check:migrations` in the running container, so a pending
   migration refuses the rollout instead of serving code ahead of its schema.
6. **Vercel and Neon leave production.** Their projects remain only until the owner authorizes deletion;
   the last Neon dump was restored into the VPS and the restore drill passed. Historical ADRs stay as
   history; this ADR is the current deployment authority.

## Consequences

- One failure domain. A disk, kernel or Docker failure takes the shop down. Local backups are on the
  same disk and are **not** an off-site backup: an S3/SFTP destination is an owner decision.
- 2.5 GB RAM is enough for Coolify, PostgreSQL and the app, but a build is the memory peak. The host has
  1.3 GB swap. Add a build server or more RAM before adding workloads.
- No CDN. Catalog bytes are served by the VPS with a one-year immutable header; the browser caches them,
  but the first visitor after a cold cache pays the VPS bandwidth.
- `sslmode=no-verify` is an accepted narrow exception for the same-host Docker network. Do not copy it
  to a remote database.
- The committed Android APK still loads `https://queenbees.vercel.app/qbpanel`. Rebuild it with
  `QUEENBEES_PANEL_URL=https://www.queenbeesbd.com` before retiring the Vercel alias.
- Vercel's automatic per-push deploy is retired with the project. Coolify's webhook replaces it; a push
  to another branch does not deploy production.

**Operational detail:** `docs/deployment.md` states what a commit must satisfy so its image serves the
new code; `docs/deployment-vps.md` is the host runbook (addresses, env keys, backups, restore and
rollback).

## Verification (2026-11-20)

- 37/37 migrations applied and `npm run db:validate` passes on the VPS (55 tables, 227 checks, 115
  indexes, 14 triggers).
- A scheduled backup executed (740 KB) and restored into a disposable database with all 55 tables.
- `https://www.queenbeesbd.com` returns 200; `/products`, `/categories`, `/brands`, `/cart`,
  `/account/login`, `/qbpanel/login` and `/api/search` return 200; a catalog WebP returns 200.
- `/qbpanel/login` carries `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`; the storefront sends
  the existing CSP and HSTS headers.
- A push to `main` produced a Coolify deployment from the webhook, and the new container reported
  healthy before the old one was removed.