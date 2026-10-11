# ADR 0006 - Neon Object Storage for product images

- Status: accepted (owner-approved)
- Date: 2026-10-11
- Relates to: `docs/platform-architecture.md` section 11 decision D3, and section 8

## Context

QueenBee's runs an independent e-commerce platform (`docs/decisions/0004-independent-platform-direction.md`) on Neon PostgreSQL (D1, ADR 0005) and Vercel (D2, ADR 0005).

Product photography needs a storage location. Three constraints shape the choice:

1. **Image bytes must not live in PostgreSQL.** They are ordinary files of a few hundred KB; putting them in the database would inflate backups, slow queries and blur the storage boundary. No documented technical constraint justifies it.
2. **Vercel's writable filesystem is not persistent.** It is ephemeral and per-instance, so it cannot hold uploads.
3. **Development and preview environments must not be able to modify production imagery.** A preview deployment writing to production storage would be a data-integrity incident, not an inconvenience.

The earlier proposal recommended Cloudflare R2 on cost and in-country delivery grounds. Re-examining it against the requirement for environment isolation, and evaluating Neon's first-party Object Storage, changed the recommendation.

## Decision

**Neon Object Storage is approved as QueenBee's product-image storage.**

### Architecture

| Layer | Responsibility |
| --- | --- |
| **Vercel** | Next.js application hosting |
| **Neon PostgreSQL** | Structured commerce data, and image metadata plus our own object keys |
| **Neon Object Storage** | Product-image bytes and appropriate media |

### Verified properties (official Neon documentation, 2026-10-11)

| Property | Verified value |
| --- | --- |
| Availability | **GA** since 17 Sep 2026; Neon states the backend tools are GA and ready for production |
| Free-plan allowance | **5 GB per project**, on any plan. Free plan requires **no credit card** |
| Paid rate | **$0.023/GB-month** |
| Regions | `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, **`aws-ap-southeast-1` (Singapore)** |
| Public delivery | `public_read` buckets serve anonymously at `https://<branch-id>.storage.c-<N>.<region>.aws.neon.tech/<bucket>/<key>` |
| Private assets | `private` buckets require a valid credential for every operation |
| Upload APIs | Standard **S3 SDKs** (AWS SDK, boto3, AWS CLI, Files SDK) and **presigned PUT** URLs |
| Credentials | Scoped `storage:read` / `storage:write`; map to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. **No AWS account or IAM setup** |
| Branch isolation | Buckets and objects inherit at fork (copy-on-write). New uploads, overwrites and deletes on a child branch are visible only on that branch and its descendants |
| Credential binding | A credential is valid on its anchor branch and descendants, and invalid outside that lineage |
| Max object size | **5 GiB** (single request or multipart) |
| Rate limiting | Requests may be throttled with `503 SlowDown` under heavy use |
| Egress | **Public network transfer: 5 GB per project included** on Free; 500 GB on Launch, then $0.10/GB |
| CDN | **Not documented.** Public objects are served from the storage endpoint directly |
| Bucket access level | Set through the Neon Console or API only; S3 ACL and bucket-policy mutations return `501 Not Implemented` |

### Why this over Cloudflare R2

**Branch isolation is the decisive advantage.** Preview and development environments cannot modify production imagery by design, and the database rows and the files they point at fork together, so a preview environment is internally consistent rather than pointing at half-updated assets. Cloudflare R2 would have required building that isolation ourselves with separate buckets and credential discipline.

Secondary reasons: it is **first-party** alongside our Neon database, so one vendor, one credential system and one bill; credentials are **branch-lineage bound**, so a staging credential cannot reach production storage; the free tier covers our scale with room to spare; and it is **S3-compatible**, so the client code is portable.

The earlier R2 recommendation is **withdrawn**.

## Consequences

- Phase 10 is no longer blocked by D3. D9 and D11 are now approved as well, so **no decision blocks Phase 10**; the phase remains unstarted pending explicit owner authorization.
- **Nothing is provisioned by this ADR.** No Neon project, no bucket, no credential, no deployment. This approves the architecture decision and documentation only.
- **Product image bytes are never stored in PostgreSQL.** PostgreSQL stores our own object key, alt text per locale, display order, dimensions, content type, provenance and rights.
- **Vercel's writable temporary filesystem is never used for persistent uploads.** Uploads go to object storage directly.
- **The database never stores a provider URL as a product's identity.** Neon's public URLs embed the branch id, so a stored URL would be wrong on any other branch. The public URL is derived at render time, which the existing `src/lib/images.ts` key-based derivation already does.
- Product imagery lives in a `public_read` bucket; any customer-uploaded file goes to a **separate `private` bucket**. The two are never mixed.
- **Each environment is pointed at its own branch endpoint and its own credential.** Preview deployments must never use production storage credentials or endpoints. Note the residual risk below: the credential is lineage-bound, not environment-bound, so this is a configuration discipline, not an enforced guarantee.

### Accepted residual limitations

1. **No CDN in front of public objects.** Cloudflare's Dhaka and Chittagong points of presence are not available on this path. Mitigation: serve imagery through Vercel's image optimisation and CDN, which is already in the stack.
2. **No Bangladesh or India region.** The nearest supported region is Singapore, so an uncached fetch carries a real cross-region round trip.
3. **Egress is metered.** 5 GB per project included on Free. At our image sizes that is tens of thousands of views per month, but it is the one cost line that grows with browsing rather than with catalog size.
4. **Branch isolation protects data, not configuration.** A preview deployment misconfigured with the production branch endpoint and credential would write to production.
5. **Public URLs embed the branch id,** which is why the database stores keys rather than URLs.

### Acceptance criteria carried into implementation and deployment

These are **not yet verified** and must be measured, not assumed:

- Image delivery latency to Bangladesh, and whether serving through Vercel's image optimisation and CDN is sufficient without a CDN in front of storage.
- Actual egress volume against the included allowance, with a documented threshold for revisiting the plan tier.
- A demonstrated preview-environment check confirming preview uses its own branch endpoint and credential.
- A demonstrated upload round trip: admin upload, server-side validation, server-generated key, `public_read` delivery, and deletion.
- Confirmation that no product image byte is stored in PostgreSQL and that no persistent write goes to the Vercel filesystem.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Cloudflare R2** | Free egress and Dhaka/Chittagong PoPs were attractive, but it is a second vendor with a second credential system and no branch alignment with the database, so preview isolation would be our own responsibility |
| **AWS S3 / Backblaze B2** | Durable and portable, but second vendor; S3 charges egress; neither aligns with database branching |
| **Supabase Storage** | Would tie image delivery to a database vendor we are not using |
| **Committed static assets** | The current demo approach. Does not scale to merchant uploads; every image becomes a deploy |
| **Bytes in PostgreSQL** | No documented technical constraint justifies it; inflates backups and slows queries |

## Verification

This ADR records an approved architecture decision. No application code, dependency, configuration, environment variable or asset changed with it. No Neon project, bucket, credential or Vercel deployment was created, and no migration was written.
