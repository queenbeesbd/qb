# Independent platform architecture

**Product model: a single store, owner-operated (ADR 0008).** QueenBee's serves one store for one owner. It is not a marketplace, a multi-vendor platform or a hosted store platform, so there is no merchant onboarding, seller dashboard, commission, payout or tenant isolation anywhere in this architecture.

Status: 2026-10-15. Direction approved in `docs/decisions/0004-independent-platform-direction.md`; **D1, D2, D3, D7, D8, D9, D11 and D12 are owner-approved** (ADRs 0005 and 0006, and section 11), **D14 and D18 (the ORM/query layer and the database driver) are approved in ADR 0007**, **D10, D13 and D19-D23 are approved in ADR 0009**, and **D17 (customer authentication) is approved in ADR 0012** with **D19's ordering gate settled in ADR 0013**. The Phase 16 checkout, payment-verification, delivery-charge, expiry and notification decisions are recorded in **ADR 0014**. The remaining entries (D4, D5, D6, D15, D16) are deferred with stated reasons - **and the 24-hour expiry is now deferred, so D16 does not block Phase 16.** **Phase 10 designed the full relational schema, state machines and security architecture in `docs/data-model.md`**; no deferred entry blocks that design, and **no decision now blocks implementation of checkout**. This supersedes the "backend integration boundary" section previously in `docs/architecture.md`.

> **Product model (ADR 0008).** This architecture serves **one store** for **one owner**. It is not a
> multi-vendor marketplace or a hosted store platform: there is no merchant onboarding, no seller
> dashboard, no commission or payout model, and no tenant isolation, because there are no tenants.
> "Merchant" below refers only to the **payment counterparty** (the store's own bKash/Nagad account)
> or to **Zatiq Easy**, the third-party multi-tenant platform audited in Phase 7.

Companion documents: `docs/architecture.md` (implemented storefront boundaries), `docs/qbpanel-dashboard.md` (dashboard scope and analytics), `docs/security.md` (controls), `docs/migration-plan.md` (data migration), `docs/implementation-plan.md` (roadmap).

## 1. What must exist

The platform has three deployable concerns. They may share one codebase or be split, but the responsibilities are distinct.

| Concern | Responsibility | Trust level |
| --- | --- | --- |
| **Storefront** | Public shopping UI. Displays catalog, cart, checkout. | Untrusted input |
| **Admin dashboard** | Store operations for this store's owner: products, orders, customers, settings, analytics. | Authenticated owner (and approved staff) only |
| **Backend/API + database** | System of record. Owns price, discount, stock, orders, payments. | **Trusted** |

The storefront and admin may live in one Next.js application with route groups, or as separate deployments. A single application is the lower-cost default; splitting is justified later if admin and storefront need different release cadences or exposure.

### 1.1 Hosting model

Requirements that actually drive the choice: server-side rendering of catalog and admin routes, a persistent database connection, a background worker for jobs and future webhooks, secret storage, atomic deploys with rollback, and acceptable latency for shoppers in Bangladesh.

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| **Vercel** (Hobby free / Pro **$20/mo**) | Zero-config for Next.js; atomic deploys and instant rollback; edge CDN; managed TLS and secrets; scales to zero | Serverless functions suit request/response well but **not** long-running workers; function duration and connection limits need care with a database; cost grows with bandwidth and invocations | **Recommended for the web tier** |
| **Managed container host** (Railway, Fly.io, Render) | Long-running processes and a worker run naturally; simpler database co-location; predictable monthly cost | More moving parts than Vercel; you own more of the deploy pipeline | **Recommended if a worker must run continuously** |
| **VPS** (Hetzner, DigitalOcean, a local BD provider) | Cheapest at steady load; full control; can be hosted closer to Bangladesh | You own patching, TLS, backups, monitoring and uptime. Real operational burden for a small retailer | Viable, higher risk |
| **Shared/managed WordPress-style hosting** | Cheap | Wrong platform for a Next.js application | **Not suitable** |

**APPROVED (owner, 2026-10-11): Vercel.** Initial plan **Hobby (free)**; upgrade to **Pro (~$20/month)** when required. Recorded in `docs/decisions/0005-neon-postgresql-and-vercel-hosting.md`.

The worker is deferred until a real job exists, and **no background job is introduced now (ADR 0014 decision 11)**. Payment reconciliation is **manual and owner-driven** at launch, not a scheduled task; if a real background need appears (later webhooks), it can run as a scheduled task without a long-lived process.

**Verified pricing (2026-10-11):** Vercel Hobby is $0/mo; Pro is $20/mo and includes $20 of usage credit, 1M function invocations/month, 100 GB bandwidth/month, and 1 GB of storage with overage at $0.023/GB.

**Bangladesh latency:** Vercel's edge network has **Dhaka and Chittagong** points of presence, so static and CDN-served assets reach Bangladeshi shoppers from in-country. Server-rendered responses depend on the chosen region - an Asia/Singapore region is the sensible default. **Image delivery is the exception** and needs care: Neon Object Storage has no CDN in front of it and its nearest region is Singapore, so imagery should be served through Vercel's image optimisation and CDN rather than fetched from storage on every view. Verify with real measurements after deployment; do not assume.

**What remains unknown:** actual monthly bandwidth and invocation volume, which depend on order volume and image weight. These are the measurements that will justify (or not justify) the Pro upgrade. **Do not upgrade pre-emptively** - see the cost policy in section 11.

## 2. Proposed boundaries

```text
                    ┌──────────────────────────┐
   shopper ────────►│  Storefront (public)     │
                    │  Next.js, RSC            │
                    └────────────┬─────────────┘
                                 │ server-side only
                    ┌────────────▼─────────────┐
   staff ──────────►│  Admin dashboard         │
                    │  authenticated, RBAC     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Backend / API           │  ◄── AUTHORITY
                    │  validation, pricing,    │
                    │  inventory, orders       │
                    └────────────┬─────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
   ┌────▼────┐            ┌──────▼──────┐          ┌──────▼──────┐
   │ Database│            │ Object store│          │  Providers  │
   │ catalog,│            │ product &   │          │  payment,   │
   │ orders  │            │ category    │          │  courier    │
   └─────────┘            │ imagery     │          └─────────────┘
                          └─────────────┘
```

Invariant: **the storefront never writes authoritative commerce state directly.** Every price, discount, stock check and order creation is validated server-side against the database.

## 3. Database and schema

> **The schema is now designed.** Phase 10 produced the full relational model - every table, column,
> constraint, index, retention rule and authorization boundary - plus the eight state machines, the
> transaction and concurrency design, and the security architecture. See **`docs/data-model.md`**.
> The entity list below is the earlier draft; the designed model supersedes it in detail while keeping
> the same shape. **Nothing is implemented:** no database exists, no migration has been written, and no
> resource has been provisioned.

### Requirements that drive the choice

- **Multi-row transactions.** Creating an order touches orders, order items, inventory and payment records atomically. The database must support this properly.
- **Inventory consistency.** Concurrent checkout on a low-stock item must not oversell. This needs row-level locking or an equivalent guarded update, not read-then-write.
- **Integer money.** All amounts are integer poisha. Numeric types must not introduce floating-point drift.
- **Relational shape.** Products, variants, categories, orders, customers and promotions are strongly related. A relational model is the natural fit.
- **Bilingual text.** Every user-facing entity needs `bn` and `en` variants.

### Options evaluated

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| **PostgreSQL** (managed: Neon, Supabase, Railway, RDS) | Real transactions, row locking, strong constraints, JSONB when needed, ubiquitous tooling and hosting, easy to hire for | Requires a managed provider or a server to run | **Recommended default**, subject to owner approval |
| **MySQL / MariaDB** | Mature, widely hosted | Fewer conveniences than Postgres for this shape; no clear advantage here | Viable alternative |
| **SQLite / libSQL (Turso)** | Zero-ops, very cheap, excellent for a small retailer | Write concurrency limits; horizontal scaling needs care | Viable for a low-traffic launch, weaker growth story |
| **MongoDB or other document store** | Flexible documents | Transactions and relational integrity are the core requirement here, not flexibility | **Not recommended** |

**Recommendation: PostgreSQL, as a managed service.** A relational database is not a preference here - multi-row transactions, guarded inventory decrements and foreign-key integrity are the actual requirements, and they eliminate the document-store option outright.

Managed rather than self-hosted, because a self-hosted database means owning patching, replication, point-in-time recovery and failover - operational work a small retailer should not take on to save a few dollars a month.

| Managed option | Verified pricing (2026-10-11) | Notes |
| --- | --- | --- |
| **Neon** | Free tier: 1 GB storage, 100 CU-hours/month, 2 CU max. Paid compute **$0.106/CU-hr** (Launch), storage **$0.35/GB-month**. Published typical spend **~$15/mo** at intermittent 1 GB load | Serverless Postgres with branching and instant restore. Scale-to-zero suits low, spiky traffic |
| **Supabase** | Free tier: 1 GB file storage, 5 GB egress, paused after 1 week idle. Pro **$25/mo** including 8 GB disk, 250 GB egress, 100 GB file storage | Postgres plus auth, storage and realtime in one product. Attractive if its extras are used; otherwise it is paying for unused surface |
| **Railway / Render / RDS** | Comparable managed Postgres; pricing varies by plan | Reasonable alternatives; less distinctive for this shape |

**APPROVED (owner, 2026-10-11): Neon PostgreSQL.** Initial plan **Free**; upgrade to a paid plan at approximately **$15/month** when business growth or operational requirements justify it. Recorded in `docs/decisions/0005-neon-postgresql-and-vercel-hosting.md`.

Neon was chosen because scale-to-zero matches a small retailer's traffic pattern and the free tier covers development and early production. **Supabase was the meaningful alternative** and would become the stronger choice only if the owner wanted bundled file storage and auth from one vendor - at the cost of tying storage to the database vendor and paying $25/month from the start.

**Recovery and security:** choose a provider offering automated backups **and point-in-time restore**, and rehearse an actual restore. Neon's instant restore and branching make this cheap to test; that is a substantive reason to prefer it. Connections from serverless functions must use a pooled endpoint.

**Lock-in:** both are managed Postgres, so the schema and queries are portable; the migration path is a `pg_dump` and restore. Branching and instant restore are the vendor-specific conveniences that would be lost.

**What remains unknown:** actual usage against the Free tier's compute and storage limits. These are the measurements that will justify (or not justify) the paid upgrade.

**Owner approval: granted** for the engine and provider. The staff-authentication decision (D13) remains open and is unaffected by this choice, since Neon is a plain managed Postgres and does not bundle an identity provider.

### Draft entity set

Presented to show shape, not to fix a schema.

| Entity | Notes |
| --- | --- |
| `product` | Identity, slug, brand, category, publication status, bilingual name/description |
| `product_variant` | SKU, option values, price, comparison price, stock. Products may have exactly one implicit variant at launch |
| `product_image` | Object-store key, alt text per locale, display order, rights/provenance |
| `category` | Slug, bilingual name, display order, visibility, optional image or SVG mark |
| `inventory_movement` | Append-only stock changes, so stock is auditable rather than a bare counter |
| `order` | Status, totals, currency, shipping address, payment state, idempotency key |
| `order_item` | Product/variant snapshot at purchase time (name and price frozen) |
| `order_status_event` | Append-only lifecycle history for audit |
| `customer` | Minimal personal data, order linkage |
| `promotion` | Code, rules, validity window, eligibility, usage limits |
| `shipping_zone` / `shipping_rate` | **Not created (ADR 0014 decision 10).** Delivery areas and charges are a confirmed requirement, but the table does not exist: per-area charges are a **required future migration** (one row per area plus a settings default) and the amounts, areas and matching policy are unapproved owner inputs. The flat `store_setting` row is the only current representation |
| `admin_user` / `role` / `audit_log` | Administrative access and change history |
| `curation` | Featured shelf and homepage collection membership, as ordered id lists |

Two deliberate carry-overs from the current storefront: **curation stays an id list rather than a product flag** (ADR-consistent and already enforced by `check:catalog`), and **order items freeze product name and price** so history does not mutate when a product is edited.

## 4. Authentication and administrative authorization

Two distinct concerns that must not be conflated:

| Concern | Who | Approach |
| --- | --- | --- |
| **Staff/qbpanel auth** | QueenBee's employees | Credential login with strong password hashing, server-side sessions in httpOnly cookies, role-based permissions, account recovery, audit logging |
| **Customer auth** | Shoppers | **Required before ordering (D12).** Guests may browse and build a cart; login or registration is required to place an order. The cart is preserved across authentication and the customer returns to checkout |

Options for staff auth:

| Option | Strengths | Weaknesses |
| --- | --- | --- |
| **Auth.js (NextAuth) with credentials + database sessions** | Fits the existing Next.js stack, no vendor dependency, well understood | Credentials flow must be implemented carefully; session hardening is our responsibility |
| **A maintained session library or hand-rolled sessions** | Full control, minimal surface | More code to get right; easy to make subtle mistakes |
| **Hosted identity provider (Clerk, Auth0, WorkOS)** | Fast to integrate, handles recovery and MFA | Recurring cost, vendor lock-in, another data processor |

**Recommendation:** first-party sessions backed by the database, so staff identity and audit live in the same system as orders. A hosted provider is acceptable if the owner prefers lower build cost, but it must be recorded as a deliberate lock-in decision.

**Customer accounts (D12, approved; D17 settled in ADR 0012).** Because ordering requires an account, customer authentication is a launch requirement rather than an optional later addition. **D17 is settled: first-party customer sessions** - email and password registration and sign-in, **scrypt** hashing (never plaintext), opaque 256-bit session tokens stored only as a **SHA-256 hash**, httpOnly `SameSite=Lax` cookies with idle and absolute expiry, account- and source-keyed throttling, customer-scoped CSRF, and **strict separation from owner/qbpanel credentials, sessions and permissions**. **A Bangladeshi mobile number or an email address is the sign-in identifier (ADR 0036, 2026-11-11).** Phone-first registration is the default; an email address is required in both modes because the mailed recovery link is the only self-service route, and the number is not verified while no SMS gateway is authorized. Registration sends a Resend verification link, but the account is usable immediately. **No external identity provider, OAuth client or SMS gateway is authorized.** **There is no self-service password recovery at launch** - a documented limitation, not a hidden gap; any operational reset is an **owner-operated process** with one-time credentials, audit logging and session revocation. Object-level authorization ensures one customer cannot reach another's orders or profile. Session and cart interplay matters: a guest's cart must survive the authentication redirect, and the customer must land back at checkout rather than on a generic home page.

Regardless of choice: **administrative credentials never reach the browser bundle**, and admin routes are protected by server-side authorization checks, not by hiding UI.

## 5. Pricing, inventory and order integrity

These are the correctness core of the platform.

### Pricing

- Price and comparison price are stored on the variant as integer poisha.
- Discounts are **derived**, never stored as a redundant value.
- The cart stores product/variant ids and quantities only. **The cart never stores a price.** Totals are recomputed server-side on every read and at order creation.
- A promotion is validated server-side against its rules, window and eligibility at the moment of order creation, not when it was applied.

### Inventory and reservation (D11 - APPROVED)

> **Amended by ADR 0013 (owner-decided, 2026-10-15): availability is the only ordering gate.** Order creation reads `product.availability` and writes **no** reservation, allocation, deduction or automatic availability change. The D11 reservation, ledger and balance design described below is **not exercised by the order path**; the tables remain implemented and unused. Overselling is **not** prevented and is accepted by the owner. The D11 rules concerning payment claims remain approved for the payment flow (Phase 16).

**The owner's rule:** when only limited stock is available, the customer whose payment is **successfully completed/verified first** gets the product. This is a payment-priority rule; it is **not** permission to oversell.

**The full analysis - all ten required cases, both models and the binding invariants - is in `docs/payment-workflow.md` section 13.10.** Summary here:

#### Stock is four separate figures, and three more states that are not stock

| Concept | Meaning |
| --- | --- |
| `on_hand` | Physical units held |
| `reserved` | Units held by orders neither fulfilled nor released |
| `available` | `on_hand - reserved`; the only figure a new order may consume |
| reservation state | `held` -> `consumed` (fulfilled) or `released` (given up) |

`payment_status`, `order.status`, `refund_status` and the customer review flag are **separate from stock and from each other**.

#### What is settled regardless of the model

- Reservation and availability checks are **atomic**; a guarded conditional decrement fails when `available < n`, so **concurrent orders can never oversell**.
- Order creation is **idempotent** via a client-supplied key, so a retry does not reserve twice.
- **Verification does not move stock.** It clears the reservation's expiry, making the hold permanent until fulfilment. Stock is `consumed` only when goods ship, so "payment verified" and "stock consumed" stay distinct facts.
- **Automatic release applies only to orders with no submitted payment claim.** An order whose customer submitted details is **never released by a timer**, because a genuine payment may exist.
- Release is a single state-guarded transition and therefore **idempotent** - one release per order, ever, with one ledger row keyed to it.
- **Returned goods become sellable only after physical receipt and inspection.** Goods that fail inspection are written off, not restored.

#### The allocation rule - decided by the owner

**Owner's decision (2026-10-11):** *the customer who first paid - who first placed the order with the transaction id and sender number - gets the product.*

Priority is therefore decided by the **order of payment-claim submission**, not by order placement and not by the owner's verification time. A later claim **preempts** an earlier order that has **not** submitted a claim. An order that has submitted a claim is **never** preempted and **never** released by a timer.

**Accepted consequence:** an order may be accepted for a unit already held by an unsubmitted order, so a losing customer who had already transferred money must be **refunded manually through support**. The storefront should claim the unit **at submission, before showing payment instructions**, to narrow that window.

**Bound decided (owner, 2026-10-11):** **at most one active submitted payment claim per unit.** Once a unit carries a submitted claim, no further claim is accepted for it. **Re-scoped for launch by ADR 0013/ADR 0014:** no unit is reserved or allocated and overselling is accepted, so the implemented bound is **per order** and it governs the verification queue. Full analysis in `docs/payment-workflow.md` section 13.10.7.

**D9 stock policies (approved; expiry deferred by ADR 0014):** a **24-hour expiry** that applies **only** to orders with no submitted claim - **not scheduled, and not a launch priority (ADR 0014 decision 11)** - and COD failed-delivery/return handling that makes goods sellable again only after physical inspection. See `docs/payment-workflow.md` section 13.9.

### Order creation

- Every order carries a client-supplied **idempotency key**. A repeat submission returns the original order rather than creating a second one.
- The order, its items and the payment record are written in **one transaction**. **No inventory decrement is written** - availability is the only stock gate (ADR 0013).
- Order status transitions are validated against an explicit state machine and recorded as append-only events.
- If a payment provider confirms after a failure or timeout, reconciliation must detect and resolve the mismatch rather than creating a duplicate order.

## 6. Payments - Cash on Delivery only

**Current release (D7 narrowed by ADR 0015, 2026-10-17):** QueenBee's accepts **one** payment method - **Cash on Delivery**. There is **no prepaid method**, no payment instruction, no recipient configuration and no verification queue: the manual bKash/Nagad flow and its `payment.*` permissions were **removed from the application**. **No online gateway is authorized**, and automated payment is a future roadmap item with no selected provider.

**COD is a distinct payment method**: it has no verification step, the courier collects cash, and it carries its own confirmation, failed-delivery and reconciliation behaviour. The owner confirms every COD order by phone before dispatch (see `docs/payment-workflow.md` section 1).

**Withdrawn (D8, ADR 0015):** the prepaid claim fields - sender mobile number, transaction ID/reference - and the owner-configured recipient accounts. None is collected, stored or displayed. The schema tables that held them (`payment_recipient`, `payment_claim`) remain implemented and **unused**.

**Historical (D9, no longer reachable - ADR 0015).** The verification window, the exceptions queue, the `verified`/`rejected`/`falsely_claimed` claim outcomes and the false-claim finding were part of the removed manual prepaid flow. They are retained in the schema and in `docs/payment-workflow.md` as history. Two rules survive for any future gateway: **a customer-submitted artefact is never proof of payment**, and **an ordinary unpaid or cancelled order is not a fraud signal**. A customer ban is always a separate, reasoned, audited owner action.

**Approved (D9) - cancellation and refunds.** Cancellation is requested **through support with the order ID** within 24 hours of placement; the customer never cancels or refunds self-service. Refunds are **manual through support**, and `refund.state` (`requested` / `processing` / `completed` / `failed`) in its own `refund` table is **separate from `order.payment_state`** - a dashboard must never report a refund as completed merely because it was requested or approved.

**Approved (D9) - COD.** Every **COD order is manually approved by the owner before dispatch**, and COD has **no** verification requirement of any kind. This is the only payment path in this release.

**Approved (D9) - expiry, cancellation and the COD lifecycle; expiry amended by ADR 0014.** An order with no submitted claim **expires 24 hours after placement** - **deferred, not a launch priority: no scheduler or expiry job is added now.** An order awaiting verification never expires automatically. Cancellation after the window is a **pre-dispatch support decision** or, once dispatched, a **delivery cancellation / return case**. COD follows the same shape: owner approval before dispatch, support cancellation before dispatch, the return workflow after, return-to-store on failure, and **separate delivery-completion, cash-collection and reconciliation states**. Full text: `docs/payment-workflow.md` section 13.9.

The full design - status enums, customer workflow, admin verification queue, audit requirements, retention and threat model - is in **`docs/payment-workflow.md`**. Summary of the architecture here:

- **Order status and payment state are separate columns.** Fulfilment position and money position are different facts and must not be conflated.
- `order.payment_state` moves `awaiting_payment` → `awaiting_verification` → `verified` | `rejected` | `falsely_claimed`, with `expired` for an unpaid order that lapsed (**deferred, ADR 0014**). **Refund state is not part of this enum** - it is the separate `refund` table with `refund.state` (`requested`/`processing`/`completed`/`failed`), and a payment is never described as refunded because a refund was requested.
- COD is modelled in its own `cod_state` field rather than inside the payment enum, so approval, collection, delivery and reconciliation stay distinct (see `docs/data-model.md` section 11.6). The approved COD state names are unchanged.
- The storefront can reach `awaiting_verification` at most. **`verified`, `rejected` and `falsely_claimed` are administrative actions only**, authorized server-side per request.
- **A customer-submitted transaction id, screenshot, sender number or confirmation message is never proof of payment.** Verification means an authorized person independently confirming receipt through the merchant account.
- Verification and rejection are **idempotent**, audited with actor, timestamp, decision and reason, and recorded as append-only events.
- Duplicate transaction references across orders are **detected and flagged** before a decision, not silently accepted.
- PINs, OTPs, passwords and MFS credentials are **never** requested, collected or stored.
- Payment method, recipient numbers and customer instructions are **owner settings**, not hardcoded values.

### Extension point for a future gateway

No provider-abstraction framework is built now. The payment record, the status enum and the audit trail are shared, so adding a signature-verified webhook path later is an addition rather than a rewrite. Building an abstraction before a second provider exists would be speculative complexity. See `docs/payment-workflow.md` §12 for exactly what changes.

### Automated gateways - deferred

Explicitly **not** implemented, provisioned or onboarded at launch: SSLCommerz, automated bKash/Nagad APIs, payment webhooks, automatic payment confirmation, automated refunds. The manual workflow must be secure and usable on its own, with no dependency on future gateway work.

### Non-negotiables

- Payment status is set **only** by an authorized administrative action (and, in a future gateway, by a signature-verified callback or server-side verification call). **Never** from a client response.
- Amount, currency and order reference are matched before any state change.
- The storefront never sees a provider secret key.
- No provider secret is stored in the client bundle, logs or documentation.

## 7. Shipping and courier

| Concern | Approach |
| --- | --- |
| Delivery areas and charges | **Confirmed requirement, not yet representable (ADR 0014 decision 10).** Zones and rates are owned by the store owner and never hardcoded, but **no area/rate table exists yet**: per-area charges need a migration, and the amounts, areas and matching policy are unapproved owner values |
| Courier integration | Pathao, Steadfast, RedX, Paperfly and similar are candidates; each needs credentials, a sandbox if available, and a documented contract |
| Tracking | Store courier consignment id and status; surface delivery status to the customer |
| COD | Modelled as a payment method with its own reconciliation and remittance tracking |
| Exceptions | Failed delivery, return-to-sender and partial delivery need explicit states |

### Launch approach: manual dispatch, no courier API

**A courier API is not required for launch.** The verified launch requirement is to hand parcels to a courier and record what happened - not to book them programmatically. Manual dispatch means: the admin records a consignment reference and a status; the courier is engaged by phone, portal or pickup as the owner already does today.

| Concern | Launch approach | Later |
| --- | --- | --- |
| Delivery areas and charges | Owner-configured zones and rates stored as settings, never hardcoded. **Unchanged in principle, but not built:** the flat `store_setting` holds one default at most, per-area charges need a new table, and the values/matching policy are outstanding owner inputs (ADR 0014) |
| Dispatch | Manual; admin records courier name and consignment id | Optional API booking |
| Tracking | Consignment id stored and shown to the customer; status updated manually | Optional automatic status sync |
| COD | Modelled as a payment method with its own reconciliation | Unchanged |
| Failed delivery / return | Explicit states, updated manually | Optional automatic sync |

**Candidates, and what was actually verified (2026-10-11):**

| Courier | Verified | Notes |
| --- | --- | --- |
| **Steadfast** | Public site states 495 upazilas, ~1,000 delivery points, ~7,500 personnel; advertises **API and plugins**, spreadsheet upload, tracking stages (pickup, hub, out-for-delivery, handover), same-day Dhaka / next-morning elsewhere, and a delivery-risk check by buyer number | Strongest verified candidate for a future API integration |
| **Pathao / RedX** | Their merchant sites did not render usable content for verification in this pass | Candidates already named in the storefront's reference material; **API availability unverified** |

Because the launch model is manual, none of this blocks Phase 10. Courier API availability only matters if the owner later wants automated booking, and that would be evaluated with the provider's actual documentation.

**No delivery charge, coverage claim or delivery-time promise is made in this document.** Those are business decisions, and the storefront must not display any of them until the owner approves them.

## 8. Image storage and delivery

Product photography must not live in the application filesystem on a serverless host.

| Option | Strengths | Weaknesses |
| --- | --- | --- |
| **Neon Object Storage** (first-party, with our Neon Postgres) | S3-compatible; **branches with the database**; one vendor and one credential system; free tier covers our scale | **No CDN in front of public objects**; nearest region is Singapore; egress is metered; public URL embeds the branch id |
| **Cloudflare R2** | Free egress; Dhaka and Chittagong PoPs | A second vendor, second credential system, and no branch-alignment with the database |
| **AWS S3 / Backblaze B2** | Durable, portable, standard | Second vendor; S3 charges egress; neither aligns with database branching |
| **Committed static assets** (current demo approach) | No dependency; works for 22 images | Does not scale to catalog uploads; every image becomes a deploy |

**Recommendation: Neon Object Storage**, with derivatives (thumbnail/medium/large, WebP + fallback) generated **on upload** rather than at request time.

### Verified evidence (official Neon documentation, 2026-10-11)

| Question | Verified answer |
| --- | --- |
| Does it exist and is it production-ready? | Yes. **GA** since 17 Sep 2026; Neon states all backend tools are "GA and ready for production" |
| Free-plan allowance | **5 GB per project**, available on any plan. Free plan requires **no credit card** |
| Paid rate | **$0.023/GB-month** (Launch and Scale) |
| Regional availability | `aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, **`aws-ap-southeast-1` (Singapore)**. Expanding toward all regions |
| Signup / card | Free plan: no credit card required |
| Upload APIs | Standard **S3 SDKs** (AWS SDK, boto3, AWS CLI, Files SDK) plus **presigned PUT** URLs |
| Public image delivery | `public_read` buckets serve anonymously at `https://<branch-id>.storage.c-<N>.<region>.aws.neon.tech/<bucket>/<key>` |
| Private assets | `private` buckets require a valid credential for every operation |
| Max object size | **5 GiB** (single request or multipart) |
| Rate limiting | Requests may be throttled under heavy use, returning `503 SlowDown` |
| Credentials | Scoped `storage:read` / `storage:write`; map to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`; **no AWS account or IAM setup** |
| Egress | **Public network transfer: 5 GB per project included** on Free; 500 GB on Launch then $0.10/GB |
| CDN | **Not documented.** Public objects are served from the storage endpoint directly |

### Why it wins for this project

1. **It is first-party.** QueenBee's already runs on Neon Postgres (D1). Adding object storage keeps **one vendor, one credential system and one bill** instead of introducing a second provider for a catalog that fits in a fraction of the free tier.
2. **It branches with the database - this is the decisive advantage.** Buckets and objects inherit at fork using copy-on-write, and *"new uploads, overwrites, and deletes on a child branch are only visible on that branch and its descendants"*. Preview and development environments therefore **cannot modify production imagery** by design, which is exactly the requirement. The database rows and the files they point at fork together, so a preview environment is internally consistent rather than pointing at half-updated assets.
3. **Credentials are branch-scoped.** A credential is valid on its anchor branch and its descendants, and **invalid on branches outside that lineage**, so a staging credential cannot reach production storage.
4. **Cost is effectively zero at our scale.** 5 GB free against a catalog of a few hundred products at a few hundred KB per derivative - well under 1 GB. This does not change the D1/D2 decisions or the cost policy.
5. **No lock-in penalty relative to the alternatives.** It is S3-compatible, so objects are portable and client code changes little.

**Cost at QueenBee's scale:** a catalog of a few hundred products at a few hundred KB per derivative is well under the free tier's **5 GB per project** (the verified allowance - an earlier revision of this document said 10 GB, which was wrong). Image storage is therefore **not** a material cost driver, and should not influence the database or hosting decision.

**Derivatives and migration:** generating sizes on upload keeps the storefront's existing `sizes` hints honest and avoids runtime transforms. The storefront's `ProductPhoto` component and `src/lib/images.ts` key-based path derivation already assume a swappable image source, so this change stays behind that seam.

### Upload controls (approved with D3)

Object storage is only as safe as what is allowed into it. Requirements:

| Concern | Control |
| --- | --- |
| Who may upload | **Authenticated admin only.** No public or storefront upload path exists. Uploads run server-side with a `storage:write` credential, or via a **presigned PUT** URL minted server-side with a short expiry |
| Server-side validation | Content type and extension checked server-side, not trusted from the client; size bounded; the file decoded as an image before acceptance. **A presigned URL is minted only after validation**, never before |
| Object naming | Server-generated keys from an opaque id - **never the uploaded filename** and never user-supplied path segments. This removes path traversal and overwrite-by-guess |
| Access rules | Product imagery lives in a **`public_read`** bucket (anonymous reads, authenticated writes) so the storefront can serve it. Any uploaded customer file - a payment screenshot, if the owner ever enables it - goes to a **separate `private` bucket**, which requires a credential for every operation. The two are never mixed |
| Bucket configuration | Access level is set through the **Neon Console or API**, because S3 ACL and bucket-policy mutation calls return `501 Not Implemented`. It is deployment configuration, not application code |
| Overwrite safety | Keys are unique per upload; replacing an image creates a **new key** rather than overwriting in place, so a cached or in-flight response cannot serve the wrong image |
| Credentials | `storage:write` for the server-side upload path; `storage:read` where only fetching is needed. Secrets stay server-side - never in the client bundle, `NEXT_PUBLIC_*`, logs or documentation |
| Environment isolation | Each environment (production, preview, development) is pointed at **its own branch endpoint and its own credential**. Production credentials are never shared into preview environments |
| Cleanup | Superseded derivatives are deleted after a defined period, and the deletion is recorded. Deleting an object on a branch does not affect the parent, so cleanup in a preview cannot damage production |

**Object bytes live in object storage; metadata and keys live in PostgreSQL.** That split is the whole point of D3:

- PostgreSQL stores the **image record**: our own key, alt text per locale, display order, dimensions, content type, provenance and rights.
- Object storage stores the **file bytes**.
- **Product image bytes are never stored in PostgreSQL.** There is no documented technical constraint that would justify it here - the files are ordinary images of a few hundred KB, well inside the 5 GiB object limit, and putting them in the database would inflate backups, slow queries and blur the storage boundary.
- **Vercel's writable temporary filesystem is never used for persistent uploads.** It is ephemeral and per-instance; an uploaded file written there would vanish or be visible to only one instance. Uploads go to object storage directly.

**Provider-agnostic identifiers (required):** the database stores **our own image record and key**, never a provider URL or bucket name as the product's identity. The public URL is derived at render time. This matters more with Neon than with a generic provider, because **the public URL embeds the branch id** - so a stored URL would be wrong on any other branch. The storefront's existing `src/lib/images.ts` key-based path derivation already follows this rule and should be preserved.

### Residual limitations (must stay explicit)

These are real and are not smoothed over:

1. **No CDN in front of public objects.** Neon documents public objects as served directly from the storage endpoint. Cloudflare R2's Dhaka and Chittagong points of presence are therefore **not** available on this path. **Mitigation:** serve imagery through Vercel's image optimisation and CDN, which is already in the stack, so the browser fetches a cached, optimised derivative from the edge rather than from Singapore on every view. This must be verified with real measurements after deployment, not assumed.
2. **No Bangladesh or India region.** The nearest supported region is **Singapore** (`aws-ap-southeast-1`), so an uncached fetch carries a real cross-region round trip. The mitigation above is what makes this acceptable.
3. **Egress is metered, unlike R2's free egress.** The Free plan includes 5 GB of public network transfer per project. At our image sizes that is tens of thousands of views per month, so it is not a launch blocker - but it is a limit to watch, and it is the one cost line that grows with browsing rather than with catalog size.
4. **Branch isolation protects data, not configuration.** Isolation holds *when the environment is pointed at its own branch*. A preview deployment misconfigured with the **production** branch endpoint and credential would write to production, because the credential is lineage-bound rather than environment-bound. **Mitigation:** per-environment endpoints and credentials injected from the platform's own environment configuration, never a shared production value, plus a documented check before preview environments are enabled.
5. **Public URLs embed the branch id,** so the same object has a different public URL on different branches. **Mitigation:** the database stores **our own object key**, never a URL, and the public URL is derived at render time - which the existing `src/lib/images.ts` key-based derivation already does.
6. **Bucket access level is set through the Neon Console or API only** - S3 ACL and bucket-policy mutation calls return `501 Not Implemented`. Access levels are therefore configuration, not application code.
7. **Maximum object size is 5 GiB.** Irrelevant for product photography; noted for completeness.

**Lock-in:** Neon Object Storage is S3-compatible, so objects are portable and the client code changes little if the provider ever changes. Combined with provider-agnostic keys, the exit cost is low.

**What remains unknown:** whether the owner wants a custom image domain, and the image rights position, which is a separate blocker (see `docs/migration-plan.md`).

**Owner approval required: yes**, but this is the lowest-risk decision in the register.

## 9. Analytics data sources

Analytics is **derived from QueenBee's own database**, not from a third-party analytics product. This keeps revenue figures reconcilable against orders and avoids sending customer data to a vendor.

- Aggregations run as SQL over orders, order items, products and inventory.
- Expensive aggregates are cached with a short TTL rather than recomputed per dashboard view.
- Charts read from a small set of typed endpoints with explicit date-range parameters.
- Missing or partial data is surfaced as such - never interpolated into a confident-looking line.

Design detail, chart inventory and the questions each chart answers are in `docs/qbpanel-dashboard.md`.

## 10. Background work, backups, observability

| Concern | Approach |
| --- | --- |
| Background jobs | **Deferred (ADR 0014 decision 11).** The design was a database-backed job table plus a worker process; **no scheduler, job runner or expiry infrastructure is added now**, because the 24-hour expiry is not a launch priority. Add a hosted queue only if volume justifies it. |
| Webhook handling | A single verified, idempotent endpoint per provider; processing recorded so retries are safe |
| Backups | Automated provider backups plus a **tested restore**. An untested backup is not a backup. |
| Observability | Structured logs with request ids, error tracking, and alerts on order/payment failures - not on vanity metrics |
| Recovery | Documented rollback for deploys and a defined procedure for a failed payment reconciliation |

## 11. Decision register

Phase 9 has converted the proposals into owner decisions. **D1, D2, D3, D7, D8, D9, D11 and D12 are approved** (ADRs 0005 and 0006, and this register). **No decision that blocks Phase 10 remains open.** Later approvals: **D14 and D18** (ADR 0007), **D10, D13, D19-D23** (ADR 0009), **D19's scope** (ADR 0010), **D17** (ADR 0012) and **D19's ordering gate** (ADR 0013). Costs marked *verified* come from the provider's own documentation on 2026-10-11.

| # | Decision | Proposal | Status | Blocks Phase 10 |
| --- | --- | --- | --- | --- |
| D1 | Database engine | **Neon PostgreSQL.** Initial: **Free**. Upgrade: paid plan at ~$15/mo when justified by measured usage or operational need | **APPROVED** (ADR 0005) | Settled |
| D2 | Hosting model | **Vercel.** Initial: **Hobby (free)**. Upgrade: **Pro** at ~$20/mo when required. Worker deferred until a real job exists | **APPROVED** (ADR 0005) | Settled |
| D3 | Image storage and delivery | **Neon Object Storage.** Initial: **Free** (5 GB/project). Paid rate $0.023/GB-month. Singapore region, `public_read` delivery, branch-scoped credentials, 5 GB egress included | **APPROVED** (ADR 0006) | Settled |
| D4 | Payment model | **Manual MFS verification** (`docs/payment-workflow.md`) | **APPROVED** - policy in D7-D9 | Settled |
| D5 | Automated gateway | **Not authorized (D7).** No SSLCommerz, no bKash/Nagad API, no webhooks, no auto-confirmation, no auto-refunds | **Not authorized** | No |
| D6 | Courier integration | **Manual dispatch at launch.** No courier API required | **Recommended, awaiting approval** | No |
| D7 | Payment methods | **Manual bKash**, **manual Nagad**, and **Cash on Delivery**. COD is a **distinct payment method**, not a variation of prepaid MFS. No automated gateway | **APPROVED** | Settled |
| D8 | Manual MFS payment fields | **Sender mobile number required**, **transaction ID/reference required**, **screenshot not required**. Recipient details owner-configurable, never hardcoded. Admin verification required before marking paid | **APPROVED** | Settled |
| D9 | Payment and order policy | **APPROVED; amended by ADR 0014.** 24-hour verification maximum (internal, not a customer promise); exceptions handling for late genuine payments; fake-order findings with audited reason and actor; cancellation via support; manual refunds with separate requested/processing/completed/failed states; COD owner approval before dispatch; state separation; **cancellation after the window as a pre-dispatch support decision or a post-dispatch return**; **full COD lifecycle**. **A submitted claim never expires or is released by a timer**; the **24-hour unpaid-order expiry is deferred** (no scheduler) | **APPROVED** | Settled |
| D10 | Roles permitted to verify payments | **Owner role only, and multiple owners may exist, each with full access.** No staff or support roles at launch, and no general permission-management system in the launch surface. The permission catalogue stays data rather than a code constant | **APPROVED** (ADR 0009) | Settled |
| D11 | Inventory reservation and release | **APPROVED; superseded in effect for launch by ADR 0013.** Owner's rule: the **first submitted payment claim** orders the verification queue. Implemented bound: **at most one active submitted claim per order**. With no unit reserved there is no allocation, preemption or release, and **overselling is accepted rather than prevented**; the invariant that still binds is that a **submitted claim is never expired or released by a timer** (ADR 0014) | **APPROVED** | Settled |
| D12 | Checkout model | **Account required.** Guests may browse and build a cart; login or registration is required before placing an order, with the cart preserved and the customer returned to checkout | **APPROVED** | Settled |
| D13 | Staff authentication | **Email and password, first-party** - hashed credentials, server-side sessions in httpOnly cookies, owner-issued credential recovery because no mail provider is authorized. **Resend email verification and Google sign-in are deferred** until the client confirms them | **APPROVED in shape** (ADR 0009) | Settled |
| D14 | ORM / query layer | **Drizzle ORM + drizzle-kit**, pinned to stable `0.45.x`; owned SQL migrations because the schema's safety is its partial unique indexes, CHECK constraints, triggers and grants. Prisma's larger ecosystem is a recorded trade-off | **APPROVED** (ADR 0007) | Settled |
| D15 | Single app vs split storefront/qbpanel | **Single Next.js app** with route groups initially | **Recommended, awaiting approval** | No |
| D16 | Background jobs | **Deferred, and not blocking Phase 16.** The design was a database-backed job table plus a scheduled task; **no scheduler or expiry job is added now (ADR 0014 decision 11)**, because the 24-hour unpaid-order expiry is not a launch priority | **Recommended, awaiting approval** | No |
| D17 | Customer authentication provider | **APPROVED (ADR 0012).** First-party database sessions: email and password (**scrypt**, never plaintext), opaque 256-bit session tokens stored only as a **SHA-256 hash**, httpOnly `SameSite=Lax` cookies with idle and absolute expiry, account- and source-keyed throttling, customer-scoped CSRF, and strict separation from owner/qbpanel credentials, sessions and permissions. **Phone or email is the sign-in identifier (ADR 0036)**; an email address is required in both registration modes for recovery. Registration sends a non-gating Resend verification link; **no external identity provider, OAuth or SMS is authorized**. **No self-service password recovery at launch** - an owner-operated reset with one-time credentials, audit logging and session revocation. Schema in `docs/data-model.md` sections 4 and 15 | **APPROVED** (ADR 0012) | Settled |
| D18 | Database driver | **`@neondatabase/serverless` `Pool` over WebSockets** for the deployed runtime, because the intended claim-allocation transaction is interactive and Neon's HTTP driver is documented as non-interactive only. (**At launch the order path allocates nothing - ADR 0013 - but the interactive transaction remains the design for claim submission and the order lifecycle.**) `pg` (node-postgres) locally and in tests. Selected behind one server-only module | **APPROVED** (ADR 0007) | Settled |
| D19 | Product availability | **Owner-controlled `In Stock` / `Out of Stock`, and the only ordering gate.** An out-of-stock product cannot be ordered. Not a quantity countdown, not derived, and no restock or arrival promise. **ADR 0010:** a **bare owner toggle** in Phase 13, not connected to the quantity ledger. **ADR 0013 closes the ordering question: option (a)** - order creation writes no reservation, allocation, deduction or automatic availability change; separate valid submissions may create separate orders; idempotency prevents duplicate processing of a submission, not reservation; **overselling is not prevented and is accepted**; the D11 inventory tables remain implemented and unused | **APPROVED** (ADR 0009; scope ADR 0010, ordering gate ADR 0013) | Settled |
| D20 | Customer ban after a confirmed fake order | **APPROVED** (ADR 0009). A ban requires a **confirmed** finding with an audited reason and actor, and is enforced server-side: sessions revoked, new orders and checkout refused. **Distinct from the review flag**, which does not block. A ban does not cancel, refund or delete anything | **APPROVED** | No |
| D21 | Administrative roles at launch | **Owner role only, multiple owners permitted, every owner has full access.** No staff or support roles, and no general permission-management system, in the launch surface | **APPROVED** (ADR 0009) | Settled |
| D22 | Owner authentication method | **Email and password**, first-party. **Resend email verification and Google sign-in deferred** until the client confirms them; neither is authorized, designed or provisioned | **APPROVED** (ADR 0009) | Settled |
| D23 | Log separation | **Customer/business activity records are kept separate from internal administrative and security records** wherever practical. One append-only store, distinguishable by construction: denials carry `admin.action_denied` and a category, and a customer is never an audit actor type | **APPROVED** (ADR 0009) | No |

### Database tooling (approved 2026-10-11, Phase 11)

**D14** and **D18** are recorded in **[ADR 0007](decisions/0007-drizzle-and-database-driver.md)**: Drizzle ORM + drizzle-kit pinned to stable `0.45.x`, and `@neondatabase/serverless` Pool over WebSockets for the deployed runtime because the D11 claim-allocation transaction is interactive. Migration `0001` establishes the full approved schema. Implementation and operations are documented in `docs/database.md`.

### Cost policy (approved with D1 and D2)

1. Keep initial infrastructure costs **as close to zero as reasonably possible**.
2. **Do not upgrade pre-emptively.** An upgrade is justified by measured usage, actual plan limits, reliability requirements or business growth - never by anticipation.
3. **Recheck current provider pricing and plan terms before implementation and before any upgrade recommendation.**
4. The $15 and $20 figures are the **owner's intended future budget**, not guaranteed permanent prices.

### What must be decided before Phase 10

**Settled by the owner:**

| ID | Decision | Recorded in |
| --- | --- | --- |
| D1 | Neon PostgreSQL, Free initially | ADR 0005 |
| D2 | Vercel, Hobby initially | ADR 0005 |
| D3 | Neon Object Storage for product images | ADR 0006 |
| D7 | Manual bKash, manual Nagad, and COD | this register |
| D8 | Sender number and transaction reference required; no screenshot | this register |
| D9 | Verification maximum, exceptions handling, fake-order findings, cancellation via support, manual refund states, COD approval, state separation, cancellation after the window, COD lifecycle; **the 24-hour unpaid-order expiry is deferred (ADR 0014)** | this register; `docs/payment-workflow.md` 13.1-13.9; ADR 0014 |
| D12 | Account-required checkout | this register |

**No decision blocks Phase 10.** Every blocking question from Phase 9 is answered:

1. **D9 - unpaid-order expiry: 24 hours from placement** in the design, applying only to orders with **no** submitted payment claim. An order awaiting verification never expires automatically. **Deferred by ADR 0014:** no heartbeat job is scheduled, nothing writes `expired` at launch, and under ADR 0013 there is no stock reservation to revive - revival would re-check current availability.
2. **D9 - cancellation after the window: support decides before dispatch**, and after dispatch the case becomes a **delivery cancellation / return**.
3. **D9 - COD lifecycle: owner approval before dispatch**, support cancellation before dispatch, the return workflow after, return-to-store on failure, and separate delivery-completion, cash-collection and reconciliation states.
4. **D11 - allocation bound: at most one active submitted claim per order** (the implemented `payment_claim_active_unique`). **Amended by ADR 0013/ADR 0014:** no unit is reserved or allocated and overselling is accepted, so the bound and payment priority govern the **verification queue**, not the allocation of a contested physical unit. Full text: `docs/payment-workflow.md` sections 13.9 and 13.10.7.

These fixed the **schema and transaction shape** (expiry duration and allocation bound) and the **order state machine** (post-dispatch cancellation and COD), so Phase 10 could proceed. **Since then, ADR 0013 removed the allocation/deduction from the order path and ADR 0014 deferred the expiry timer**, leaving the schema unchanged but those two features unused.

**Resolved in Phase 11:** **D14** (Drizzle ORM + drizzle-kit) and **D18** (the WebSocket driver) are approved in **ADR 0007**, together with the decision that migration `0001` establishes the full approved schema.

**Still open, but not blocking:** D5, D6, D15, D16. These can be settled later without rework, because they do not change the schema or the transaction shape. **D17 is settled (ADR 0012):** first-party customer sessions, so customer authentication no longer blocks checkout. **D19's ordering gate is settled (ADR 0013):** availability is the only ordering gate, no reservation or deduction is written, and the accepted oversell risk is recorded rather than hidden. Neither decision provisioning nor deployment follows from recording them.

### Approved decisions (owner, 2026-10-11)

**D3 - Image storage.** **Neon Object Storage**, recorded in ADR 0006. Chosen because it is first-party alongside our Neon database and because its **branching** gives the required guarantee that development and preview environments cannot modify production imagery. Full evidence and residual limitations in section 8. Cloudflare R2 is withdrawn.

**D7 - Payment methods.** Three methods are approved: **manual bKash**, **manual Nagad**, and **Cash on Delivery**. COD is a **distinct payment method**, not a variation of the prepaid MFS flow - it changes order confirmation, delivery risk, failed-delivery handling and reconciliation, and is modelled as its own method with its own lifecycle. **No automated payment gateway is authorized.**

**D8 - Manual MFS payment fields.** **Sender mobile number is required**, the **transaction ID/reference is required**, and a **payment screenshot is not required**. Recipient account details are **owner-configurable and never hardcoded** into application code. **Customer-submitted details are not proof of payment**: an authorized admin must independently verify receipt before the payment is marked paid.

**D12 - Checkout.** **Account required.** Guests may browse the storefront and add products to their cart, but must **create an account or log in before placing an order**. When a guest proceeds to checkout, the login/registration flow is presented; the **cart is preserved** and the customer is **returned to checkout** after successful authentication. Authentication, session handling, authorization and account recovery must be designed before implementation. Guest checkout must not be silently reintroduced.

**D9 - Payment and order policy (approved, amended by ADR 0014).** Approved and binding: the **24-hour verification maximum** (internal, explicitly **not** a customer-facing promise); the **exceptions queue** for genuine payments that cannot be verified in time - never silently discarded, and **never released by a timer** (no reservation is held at launch, ADR 0013); **fake-order findings** with an audited reason and actor and a **separate** customer review flag; the rule that a **rejected payment is not an accusation**; **cancellation through support**; **manual refunds** with separate `requested`/`processing`/`completed`/`failed` states; **COD owner approval before dispatch**; the **separation** of payment state, fulfilment status, COD state, refund state, reservation state and customer flag; a **24-hour unpaid-order expiry** that never touches an order with a submitted claim and is **deferred, not scheduled (ADR 0014)**; **cancellation after the window** as a pre-dispatch support decision or a post-dispatch return; and the **full COD lifecycle**. Full text: `docs/payment-workflow.md` sections 13.1-13.9.

### D11 detail (approved)

Full policy wording is in `docs/payment-workflow.md` section 13.10; the queue and expiry implications are in `docs/qbpanel-dashboard.md`.

**D11 - Inventory reservation and release.** **Approved; superseded in effect for launch by ADR 0013.** The owner's payment-priority rule is recorded: the **first submitted payment claim** orders the verification queue. The implemented bound is **at most one active submitted claim per order**. With no unit reserved there is no allocation, no preemption and no release to perform, and **overselling is accepted rather than prevented**; the reservation tables remain implemented and unused. The invariant that still binds is that a **submitted claim is never released by a timer**.

### Where the owner's commercial input remains

Every Phase 9 decision is now settled, so **nothing here blocks Phase 10**. Remaining owner input is **operational and later-phase** rather than architectural: payment recipient accounts; courier providers and COD cash-settlement terms; notification channels; reconciliation cadence; what counts as sufficient evidence of receipt; and whether a mail provider is ever authorized (which would enable email verification and self-service recovery). The **availability-versus-quantity** question is no longer open: **ADR 0013** makes availability the only ordering gate. (D10 and D13 are settled: owner role only, first-party email and password. D17 is settled in ADR 0012.) None of these changes the schema or the transaction shape.

## 12. Explicitly deferred

Multi-tenancy, a theme or landing-page builder, a subscription system, native mobile apps, reseller/wholesale modules, recommendation engines, loyalty programmes, wishlists, reviews, and any vendor growth feature. Each requires an independent QueenBee's requirement before it is considered - not a Zatiq parity argument.

## 13. Honest limitations

- This is a **proposal for the parts not yet approved**. The stack choices are approved (D1, D2, D3), but **no dependency has been added, no resource provisioned, and no code written**.
- Costs marked *verified* are taken from official provider pricing pages on 2026-10-11 and will drift. Figures described as estimates are not verified and must not be presented as quotes.
- Only three providers were examined in depth per decision, deliberately. This is not a market survey.
- Nothing here establishes that the platform is secure or production-ready. Those claims require implemented controls and verified evidence, per `docs/security.md`.
- No courier, payment or hosting account was created, and no DNS was changed.
