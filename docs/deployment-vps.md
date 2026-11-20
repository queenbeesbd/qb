# Production deployment on the VPS

This is the operational record for the self-hosted production environment. The decision is ADR 0045;
the application rules remain in `AGENTS.md`.

## Addresses

| Surface | Address |
| --- | --- |
| Storefront | `https://www.queenbeesbd.com` |
| Apex | `https://queenbeesbd.com` (301 to www) |
| Owner panel | `https://www.queenbeesbd.com/qbpanel` |
| Coolify dashboard | `https://coolify.queenbeesbd.com` |
| VPS | `198.46.221.31` (Ubuntu 24.04, 2 vCPU, 2.5 GB RAM, 30 GB disk) |

DNS lives at Namecheap: `A @`, `A www` and `A coolify` all point at `198.46.221.31`. MX/TXT records
were not changed. Let's Encrypt certificates are issued and renewed by Coolify's Traefik.

## What runs where

| Piece | Name | Notes |
| --- | --- | --- |
| Coolify | `coolify` + `coolify-db` + `coolify-redis` + `coolify-proxy` + `coolify-sentinel` | Coolify 4.7.6 |
| Application | `queenbees-storefront` | Dockerfile build from `queenbeesbd/qb`, branch `main`, port 3000 |
| Database | `queenbees-db` | PostgreSQL 17, 55 tables, TLS on, daily backup |
| Assets | Docker volumes | `catalog`, `hero`, `paymentproof` mounted into the app |

The app runs as the unprivileged `node` user. It has no read access to the host outside its mounts.

## Deploying a change

`main` is the production branch. A push starts a Coolify deployment through the GitHub webhook
(`Settings -> Webhooks` on GitHub; Coolify's URL is under the application's **Webhooks** page). Coolify
builds the Dockerfile and rolls the container. A failed build leaves the previous container running.

Before each build the application runs:

```sh
npm run check:migrations
```

in the **currently running** container. A pending migration fails the deployment. To apply migrations:

```sh
docker exec <app-container> npm run db:status
docker exec <app-container> npm run db:migrate
docker exec <app-container> npm run db:validate
```

Run `db:migrate` only from inside the application container, where `DATABASE_URL` is already present.
Never put the connection string in a shell history, a ticket or a commit.

## Environment

Runtime values are in **Coolify -> queenbees-storefront -> Environment Variables**. They are not in the
repository.

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | `postgresql://queenbees:<generated>@<db-container>:5432/queenbees?sslmode=no-verify` |
| `APP_BASE_URL` | `https://www.queenbeesbd.com` (links in account mail) |
| `TRUST_PROXY_HEADERS` | `1` - Traefik is the only public path |
| `DATABASE_DRIVER` | `pg` |
| `QUEENBEES_ENV` | `production` |
| `RESEND_API_KEY` | Optional: mailed account-security messages |
| `EMAIL_FROM` | Optional: a sender on a domain verified in Resend, e.g. `QueenBee's <no-reply@queenbeesbd.com>` |
| `BULKSMS_API_KEY` | Optional: SMS registration and recovery codes |
| `BULKSMS_SENDER_ID` | Optional: BulkSMSBD sender id; leave empty until the provider issues one |
| `TELEGRAM_BOT_TOKEN` | Optional: owner order alerts |

`CATALOG_ASSET_BASE_URL` and `CATALOG_STORAGE_*` stay **unset**: the mounted volumes are the storage.

### Adding Resend and BulkSMSBD

1. Open Coolify -> `queenbees-storefront` -> **Environment Variables**.
2. Add `RESEND_API_KEY` and `EMAIL_FROM`. Both are needed before any account mail is sent. The sender
   address must be on a domain verified in Resend; `EMAIL_FROM` is the raw value, without surrounding
   quotes.
3. Add `BULKSMS_API_KEY` and, once the provider issues it, `BULKSMS_SENDER_ID`. With either missing,
   phone registration and phone recovery are refused and the form states that the channel is
   unavailable.
4. Save, then **Restart** the application. Runtime values are read from the process at start.
5. Test: request a password-recovery link for a real address; request an SMS code for a real number.
   Do not reuse a customer's password or paste a code into a ticket.

`RESEND_API_BASE_URL`, `BULKSMS_API_URL`, `CATALOG_STORAGE_*` and `QUEENBEES_ALLOW_REMOTE_TEST_DB` are
development/test seams and must not be set in production.

## Accounts and passwords

- **Coolify dashboard:** the owner's admin email and the password chosen during installation. Change it
  at Coolify -> **Profile**. Enable two-factor authentication there before handing the host to anyone
  else.
- **Store owner account:** unchanged; the owner signs in at `/qbpanel/login` with the existing address
  and password. There is no verification mail, Google sign-in or owner-issued recovery code.
- **PostgreSQL:** user `queenbees`, generated password. Read it in Coolify -> `queenbees-db` -> General.
  Changing it there also requires updating `DATABASE_URL` and restarting the app.
- The SSH root password was supplied by the installer. An Ed25519 key is installed for the deployment
  session; rotate the root password if it was shared anywhere outside the owner's password manager.

## Backups and restore

Coolify runs a daily `pg_dump` for `queenbees-db` and keeps the last 7 local copies under
`/data/coolify/backups/databases/...` on the VPS. A successful 740 KB backup was restored into a
disposable database with all 55 tables on 2026-11-20.

Local backups do **not** survive disk or host loss. Set an S3-compatible, SFTP, FTPS or WebDAV
destination in Coolify -> `queenbees-db` -> **Backups** and test a restore. This is still an owner
decision.

Restore drill:

```sh
docker exec queenbees-db createdb -U queenbees queenbees_restore_test
docker exec queenbees-db pg_restore -U queenbees -d queenbees_restore_test --no-owner --no-privileges <file>
docker exec queenbees-db psql -U queenbees -d queenbees_restore_test -tAc \
  "select count(*) from information_schema.tables where table_schema='public'"
docker exec queenbees-db dropdb -U queenbees queenbees_restore_test
```

## Rollback

1. Coolify -> application -> **Deployments** -> redeploy the previous successful image.
2. If the database is the problem, restore the last dump. There are no down-migrations.
3. If the VPS itself is lost, point DNS back to the still-existing Vercel project until the VPS is
   restored. This is the only reason Vercel is not deleted until the owner says so.

## Asset volumes

The named volumes contain the WebP-only tree:

```sh
docker volume ls | grep iz4zgujp47s9aqyo122h3wer
docker run --rm -v <volume>:/dest -v /srv/queenbees:/src alpine \
  sh -c 'cp -a /src/catalog/. /dest/'
```

Uploads from the admin panel write to the mounted path and survive a container replacement. The image
variant rule is ADR 0044.

## Android shell

The committed debug APK still loads `https://queenbees.vercel.app/qbpanel`. Rebuild it before deleting
the Vercel project:

```sh
QUEENBEES_PANEL_URL=https://www.queenbeesbd.com npm run app:apk
```

A release build needs the owner's own keystore, which is gitignored.

## Disk usage

The 30 GB disk is not mostly the shop. On 2026-11-21 it stood at 17 GB (64%) and the breakdown was:

| What | Size |
| --- | --- |
| Docker **build cache** (BuildKit layers from every push) | 7.7 GB |
| Application images, 9 tagged builds at ~1.5 GB each | 7.5 GB (3.6 GB reclaimable) |
| Ubuntu base, `/usr`, `/boot`, apt cache | ~3.3 GB |
| Coolify stack images (coolify, helper, Traefik, Redis, Sentinel, PostgreSQL 15 and 17) | ~2.8 GB |
| Data volumes (catalog 247 MB, two PostgreSQL data dirs, hero, payment-proof) | 398 MB |
| **Database backups** | **736 KB** |

Backups are the smallest item on the disk. The growth is Docker: every push adds a tagged application
image and a fresh set of build layers, and nothing removes either on its own.

### Automatic cleanup

Coolify runs a Docker cleanup **daily at 00:00 UTC** for this server. The stored settings are
`docker_cleanup_frequency = 0 0 * * *`, `docker_cleanup_threshold = 80` and
`force_docker_cleanup = 1`, so the job runs every night regardless of the threshold. It:

- deletes application images beyond the three newest (the running one plus two rollback images);
- runs `docker builder prune -af`, dropping the whole build cache;
- removes dangling and unused non-application images, stopped Coolify containers, old helper images;
- leaves named volumes and networks alone (`delete_unused_volumes` and `delete_unused_networks` are off).

The cost of the full build-cache prune is that the first build after midnight recompiles from scratch -
`npm ci` plus `next build` takes several minutes on 2 vCPU. If deploys become too slow, turn
`force_docker_cleanup` off (Settings -> Server -> Docker cleanup, or
`PATCH /api/v1/servers/<uuid>/docker-cleanup`): the job then runs only when the disk passes 80%.

### Running it now

```sh
docker exec coolify php artisan tinker --execute="App\Actions\Server\CleanupDocker::run(App\Models\Server::first(), false, false, false, true);"
```

The fourth argument is `onlyAboveThreshold`; the fifth lets it prune the build cache while a deployment
exists. After the run on 2026-11-21 the disk went from 64% to 33% (8.8 GB used, 19 GB free).

Read the current state with `docker system df -v` and `df -h /`. The floor on this host is about 8.5 GB,
so production is expected to sit between that and roughly 11 GB between cleanups. The disk does **not**
grow with customers or orders at any meaningful rate; it grows with pushes.

## Known gaps

- No off-site backup destination yet.
- Coolify's dashboard is also reachable on `http://198.46.221.31:8000`. Use the HTTPS address and close
  port 8000 externally once the owner is comfortable.
- The Node PostgreSQL client connects with `sslmode=no-verify` because Coolify's internal CA is not in
  the image trust store. Mount `/data/coolify/ssl/coolify-ca.crt` and switch to `verify-ca` as
  hardening.
- No CDN in front of the VPS; the immutable cache header reduces repeat transfers only after the first
  visit.
- Real iOS Safari, Android Chrome and screen-reader checks remain unverified.