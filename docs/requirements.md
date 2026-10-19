# Requirements

Status: Phases 0-7 are complete as verified in `docs/project-status.md`. The Phase 7 merchant-backend audit (`docs/backend-capability-audit.md`) found no supported integration surface and an empty tenant catalog. The owner has since **approved an independent-platform direction** (`docs/decisions/0004-independent-platform-direction.md`), so the merchant platform is now a UX and feature reference only, not a dependency.

**Payment scope (ADR 0015, 2026-10-17).** This release supports **Cash on Delivery only**. The manual bKash/Nagad prepaid flow built in Phase 16 - recipient configuration, customer payment claims, the verification queue and the `payment.*` permissions - has been **removed from the application**. Automated online payment is a **future roadmap item**: no provider is chosen, nothing is authorized, and no gateway code, SDK or credential exists. Prepaid language below is retained only where it describes history, retained schema or a deferred/future item.

**Product model (ADR 0008).** QueenBee's is a **single-store, owner-operated e-commerce platform**: one store owner sells that store's own goods directly to that store's own customers. It is **not** a marketplace, a multi-vendor platform, a SaaS store builder or a hosted platform on which other businesses create stores. There are no third-party merchants, no vendor onboarding, no seller dashboards, no commissions, no marketplace payouts and no tenant isolation - because there is nothing to isolate. See `docs/decisions/0008-single-store-product-model.md`.

## Approved strategic direction

Owner-approved 2026-10-11. Full reasoning in `docs/decisions/0004-independent-platform-direction.md`; architecture in `docs/platform-architecture.md`.

### Platform ownership

| ID | Requirement | Status |
| --- | --- | --- |
| S1 | QueenBee's owns its own backend and database | Approved; **built locally (Phases 11-15), not deployed** |
| S2 | QueenBee's owns its own admin dashboard | Approved; **partly built locally (Phases 12-13: auth, catalog, availability); order/payment/shipping modules not built** |
| S3 | QueenBee's owns the product catalog, pricing, inventory, orders, customers, shipping, promotions and analytics data | Approved; **catalog, orders and customers built locally (Phases 13-15)**; shipping charges, payments and analytics not built |
| S4 | Explicit server-side authority for prices, discounts, inventory and order creation | Approved; **implemented for order creation and pricing (Phase 15, local)** - prices and totals are resolved server-side. Inventory authority is **not exercised** (ADR 0013) |
| S5 | Infrastructure and architecture chosen for this project's needs, not Zatiq's implementation | Approved; **stack selection settled** (D1/D2/D3, ADRs 0005-0006; D14/D18, ADR 0007) |
| S6 | No dependency on Zatiq's private API, internal endpoints, cookies, tenant identifiers or undocumented integrations | Approved; nothing in the repo depends on them |
| S7 | Vendor-specific features QueenBee's does not need are not reproduced | Approved; exclusions listed in `docs/admin-dashboard.md` |
| S8 | The existing Next.js + TypeScript storefront remains the frontend foundation | Approved; unchanged |
| S9 | No new backend stack is selected without a documented technical evaluation and owner approval | Approved; evaluation drafted in `docs/platform-architecture.md` |

### Consequences for existing requirements

- The demo storefront remains exactly as built. It is the frontend foundation, not a throwaway.
- The previous plan to integrate with the merchant platform is **withdrawn**; see the roadmap in `docs/implementation-plan.md`.
- Everything in the production requirements table below is now QueenBee's own work rather than a vendor capability to discover.

## Product context

**One store, one owner.** QueenBee's is the storefront and administration of a single Bangladeshi cosmetics retailer. The **owner** is the store operator; the term does not mean a platform operator overseeing other people's stores. There are no third-party sellers, so no requirement exists for merchant registration, seller onboarding, seller dashboards, commissions, payouts or per-tenant isolation (ADR 0008).

**Identity concepts, kept distinct:**

| Concept | Meaning |
| --- | --- |
| **Owner** | The person who owns this store. Holds the administrative authority. |
| **Staff member** | Optional, conditional on a documented requirement and owner approval. Not a large multi-role workforce. |
| **Customer** | A shopper with an account, required before ordering (D12). Separate from owner and staff identity. |
| **Anonymous visitor** | Public storefront access with no session. |

Bangladeshi cosmetics retailer. The audience is customers comparing brand, pack size, price and availability, frequently on mobile. No primary user research has been conducted - that is an open gap, not an assumption to build on.

Demonstration success: find a product, inspect correct information, choose a quantity, add/update/remove cart items, and switch languages without losing route or cart state.

## Implemented

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Homepage and navigation | Done | Hero with product composition, categories, featured shelf, offers |
| D2 | Categories and listings | Done | `/products` plus 5 `/categories/[slug]`; counts; reload and back/forward |
| D3 | Search, filter, sort | Done | URL-driven search across name/brand/pack/tags, category and brand filters, 4 sorts, clear-all |
| D4 | Product detail | Done | 3:4 photo, price hierarchy, brand, pack, availability note, quantity, add to cart, explicit missing-description state |
| D5 | Variants and availability | Partial | Availability is a dated snapshot with a visible caveat. No variant grouping - the storefront publishes no confirmed groups |
| D6 | Recently added | **Replaced, not shown** | No reliable date field exists. The section is now "More to explore", a curated collection, so no recency claim is made |
| D7 | Hot deals | Done | Only records with a published comparison price above current; savings and floored percentage derived |
| D8 | Cart and quantity | Done | Add/update/remove, duplicate lines merged, empty state, derived integer totals |
| D9 | Responsive and accessible | Done (headless-verified) | No overflow in Phase 5 suite across 320-1920px; drawer focus trap and Escape, skip link, reduced motion and 40px targets verified in headless Chromium; real devices/AT remain unverified |
| D10 | Language switching | Done | Whole-UI toggle, persistence, `documentElement.lang`, per-field content fallback |
| D11 | Non-happy paths | Done | Empty search, empty category, empty cart, unknown product (404), corrupt storage, unsupported locale, error boundary |
| D12 | Honest demo presentation | Done | Locked announcement strip on every route, identified simulated checkout, inert checkout route, `robots: noindex, nofollow`. Redundant explanatory demo lines were removed from the shopping UI in Phase 3 |
| D13 | Product imagery | Demo implementation done; production use blocked | 22 products have locally served WebP/JPEG at 3:4 with provenance; rights pending written confirmation |
| D14 | Featured shelf navigation | Done | **Exactly one row at every viewport**, 4 visible on desktop, 2 on mobile, group advance, controls bounded and disabled at ends, keyboard reachable, no dependency |
| D16 | Featured selection configuration | Done | `src/data/curation.ts` id list, max 6, validated against the catalog, graceful when empty |
| D17 | Curated collection | Done | "More to explore", 8 id-referenced products, disjoint from the featured and offer rows |
| D18 | Mobile category discovery | Done | Homepage category section hidden below 720px; the header drawer lists all five categories on that same breakpoint |
| D15 | Announcement configuration | Done | Typed local model with message, enabled, variant, per-locale text and a locked demo entry |

## Announcement configuration

Defined in `src/data/announcements.ts` and typed in `src/lib/types.ts`.

| Property | Type | Behaviour |
| --- | --- | --- |
| `id` | `string` | Stable key for targeting and tests |
| `enabled` | `boolean` | Ordinary on/off switch |
| `message` | `{ bn: string; en: string }` | Both locales required, so a visible strip can never render empty or untranslated |
| `variant` | `'demo' \| 'info'` | Selects the badge label and tint |
| `locked` | `boolean` | Rendered even when `enabled` is false |

The `demo-preview` entry is `locked: true`. That is what makes the demo warning survive an ordinary configuration mistake: `npm run check:catalog` fails if the entry is missing, unlocked, missing a locale, or not returned by `activeAnnouncements()`. Multiple announcements are supported and render in order.

**Future backend dependency (not implemented, not designed):** an authorised phase could return `Announcement[]` from a merchant endpoint. No API, schema, admin panel or integration exists today, and nothing in this phase assumes one. The strip is deliberately separate from the header component.

## Normalized catalog contract

Provenance and imagery in `docs/catalog.md`; types in `src/lib/types.ts`:

- `id`, `slug`, `sourceProductId`, `sourceUrl`, `capturedAt` - identity plus provenance.
- `name`, `description` - `{ bn, en }`, nullable per side, explicit fallback.
- `brand`, `pack`, `categoryId`, `tags` - `null` when unverified.
- `priceMinor`, `compareAtPriceMinor` - integer poisha; comparison must exceed current.
- `availability` - `in_stock | out_of_stock | unknown`, published snapshot only.
- `images[]` - `key`, localized `alt`, `rights`, `sourcePage`, `sourceAsset`, `retrievedAt`.
- `addedAt` - `null` for every record, because no verified dates exist.
- Curated selections are separate product-id lists in `src/data/curation.ts`; they are not catalog product fields.
- `isDemo: true` - literal marker on every record.

## Bilingual requirements

Central dictionaries with semantic namespaced keys; no scattered conditionals; no runtime machine translation; no hardcoded interface text. Per-field product fallback per ADR 0002. The toggle is keyboard accessible, visibly labelled and persistent. Bangla typography is verified for rendering, wrapping and line-height, and negative letter-spacing is explicitly disabled for Bengali. `npm run check:i18n` currently verifies 129 keys in both locales and matching placeholder tokens; this count is an audit snapshot, not a fixed requirement.

## Production requirements (not started)

These are now QueenBee's own build obligations, not vendor capabilities to discover. They remain **unestimated** in effort and cost: the estimates depend on the infrastructure decisions listed in `docs/platform-architecture.md` section 11, which require owner approval.

| Domain | Requirement |
| --- | --- |
| Accounts | **Account required before ordering (D12, approved).** Guests may browse and build a cart; login or registration is required to place an order, with the cart preserved and the customer returned to checkout. **D17 is settled (ADR 0012):** first-party email and password (**scrypt**), opaque 256-bit session tokens stored only as a SHA-256 hash, httpOnly `SameSite=Lax` cookies with idle and absolute expiry, account- and source-keyed throttling, customer-scoped CSRF, and object-level authorization (another customer's order returns 404). **Email is the sole registration and sign-in identifier**; email verification is deferred; **there is no self-service password recovery at launch** - any reset is owner-operated (one-time credential, audit logging, session revocation). No external identity, mail, OAuth or SMS provider is authorized |
| Checkout | Server-priced totals, idempotent order creation, confirmation and history. **Implemented locally (Phase 15).** Delivery quotes are **not yet possible**: delivery charges need owner values and per-area representation (ADR 0014 decision 10) |
| Delivery | Service areas, costs, COD eligibility, courier integration - **no policy is published today.** The owner has decided charges are configurable with a site-wide default and per-area overrides; **the amounts, areas and matching policy are outstanding owner inputs**, and per-area charges need a migration. **No courier API is authorized** |
| Payments | **Cash on Delivery only (ADR 0015).** COD is a distinct method: no verification step, the courier collects cash, and the owner confirms the order by phone before dispatch. **The manual bKash/Nagad flow, its recipient configuration and its verification queue were removed**; `payment_recipient` and `payment_claim` remain in the schema, unused, because they hold history. No automated gateway is authorized, and **automated online payment is a future roadmap item with no selected provider**. **The 24-hour unpaid-order expiry is deferred (ADR 0014)** and no expiry writer exists |
| Refunds | Manual through support, with `refund.state` in its own `refund` table separate from `order.payment_state`, and distinct requested / processing / completed / failed states. **Approved (D9):** a refund is recorded as completed only when the real-world action is confirmed; goods become sellable again before dispatch or, after delivery, only once physically received and inspected |
| Availability | **Owner-controlled `In Stock` / `Out of Stock` (D19, approved in ADR 0009; scope in ADR 0010).** An out-of-stock product **cannot be ordered** - the server-side orderability check refuses it. Presented as a state - never a countdown, a restock date or an arrival promise, because no restock data is verified. **Implemented in Phase 13 as a bare toggle**: no deduction, no reservation and no inventory movement, so it does **not** prevent overselling, and whether the approved quantity model becomes the allocation backstop was **open** - now **settled in ADR 0013**: availability is the **only** ordering gate, no reservation, allocation or deduction is written, and **overselling is accepted** |
| Inventory | SKU/option mapping, live stock, reservation policy, stale-cart recovery. **Not a launch requirement (ADR 0013):** the balance, ledger and reservation tables are implemented and **unused**, and overselling is accepted |
| Customers | Profile with order history and minimal personal data. **The owner may ban an account after a confirmed fake order (D20, approved in ADR 0009)**, enforced server-side by revoking sessions and refusing new orders and checkout. A ban is **not** the review flag, and does **not** cancel, refund or delete anything |
| Admin | **QueenBee's own admin dashboard is the system of record.** Scope and launch-critical split in `docs/admin-dashboard.md`. **Owner role only at launch (D10, approved in ADR 0009):** multiple owners are permitted and each has full access, but there are no staff or support roles and no general permission-management system in the launch surface |
| Imagery | Written confirmation of photography rights, or replacement assets |
| Support | Verified contact channels, order notifications, failure handling |
| Operations | Redacted logs, monitoring, backups with a tested restore, rollback |
| Deployment | Approved domain and hosting, TLS, security headers, secret management, privacy policy |

## Deferred or optional

Wishlist, reviews, brand pages, compare, recently viewed, coupons, bundles, chat ordering, cart drawer, sticky mobile CTA, localized SEO URLs, analytics with consent. Explicitly excluded: loyalty platform, native app, recommendation engine, fake reviews, skin-diagnosis features.

## Open questions for the owner

The backend-audit question is now closed: the direction is an independent platform, so there is no vendor access to obtain.

**Approved (2026-10-11):** D1 Neon PostgreSQL, D2 Vercel, D3 Neon Object Storage, D7 payment methods (now **COD only**, ADR 0015), D8 prepaid claim fields (**withdrawn with the flow**, ADR 0015), D9 payment and order policy (prepaid half superseded, COD lifecycle retained), D11 inventory reservation and release (superseded in effect by ADR 0013), D12 account-required checkout.

**Phase 16 decisions recorded (2026-10-16) in ADR 0014, narrowed on 2026-10-17 by ADR 0015:** COD owner confirmation by phone, customer bans manageable in the admin panel, self-service password reset as a **confirmed but deferred** requirement, configurable delivery charges with a site-wide default and per-area overrides, **the 24-hour expiry deferred**, and **external notifications not required now**. **ADR 0015 then removed the manual prepaid half** (recipient configuration, claim submission, mismatch hold, false-claim findings and the verification queue). **Outstanding owner inputs:** real delivery prices and areas, the area matching/fallback policy, the COD failed-delivery/retry detail, retention periods, and any future gateway decision (provider, fees, settlement, refunds, scope). **Recipient numbers and verification evidence are no longer needed, because those features no longer exist.**

**Approved (2026-10-12) in ADR 0009:** D19 owner-controlled In Stock / Out of Stock availability, D20 customer ban after a confirmed fake order with a defined enforcement boundary, D21 owner role only with multiple owners and no staff/support roles or permission-management system at launch, D22 owner authentication by email and password with Resend verification and Google sign-in deferred, and D23 separation of customer/business activity records from internal administrative and security records.

**Scope of D19 settled (2026-10-12) in ADR 0010.** Availability is a **bare owner toggle**: two states, a fail-safe default of Out of Stock, one audit action and one server-side orderability check. It is **not** connected to the quantity ledger in this phase - no deduction, no reservation, no inventory movement - and **this phase does not prevent overselling** once ordering exists. **The ordering question was settled on 2026-10-15 in ADR 0013: option (a).** Availability is the **only** ordering gate; order creation writes no reservation, allocation, deduction or automatic availability change; separate valid submissions may create separate orders; and **overselling is accepted** rather than prevented. The inventory tables remain implemented and unused.

**Phase 13 is implemented, locally (2026-10-12), and the storefront was cut over to the database catalog in Phase 14 (2026-10-15, ADR 0011).** The owner can maintain products, categories and brands; availability is an owner-controlled state the server enforces; owner accounts are managed on a minimal screen with no role picker; product imagery is associated from **existing local assets only**, with metadata read from the file; and the storefront reads a database-backed catalog through the server-only typed accessor contract. **The Phase 1 fixture is retained only as a seed and a development-only opt-in, never as a fallback**, and it is not the storefront's source of truth. **Nothing is deployed, no QueenBee's-bound cloud resource exists, and no image is uploaded anywhere.** Migration `0003` adds `product.availability`; the schema remains **40 tables**.

**D9 is approved, amended by ADR 0014.** Binding: the **24-hour verification maximum** (internal, explicitly not a customer-facing promise); the exceptions queue for genuine payments that cannot be verified in time; **fake-order findings** with an audited reason and actor and a separate customer review flag; **cancellation through support**; **manual refunds** with separate requested/processing/completed/failed states; **COD owner approval before dispatch**; the separation of prepaid payment state, fulfilment status, COD state, refund state, reservation state and customer flag; and the **full COD lifecycle** with return-to-store and separate delivery, cash-collection and reconciliation states. **The 24-hour unpaid-order expiry is deferred:** it is not a launch priority, no scheduler is added, and the binding part is that **a submitted claim never expires and is never released by a timer**.

**D11 is approved; superseded in effect for launch by ADR 0013.** The **first submitted payment claim** orders the verification queue, and **at most one active submitted claim exists per order** (implemented). With no unit reserved there is **no allocation, no preemption and no release**, and **overselling is accepted** rather than prevented; the binding invariant is that a **submitted claim is never released by a timer**. Inspection-before-restoration still governs goods: a return does not make anything sellable until it is physically received and inspected.

**No question blocks Phase 10.**

**Open but not blocking Phase 10:**

5. **Payment recipient accounts** - which merchant numbers, under what account name (stored as settings).
6. ~~**Availability and the quantity model (ADR 0009 section 1)**~~ - **settled in ADR 0013 (2026-10-15):** the toggle is the **only** ordering gate, no reservation, allocation or deduction is written, and overselling is accepted. **D10 and D13 are settled:** owner role only, multiple owners permitted, first-party email and password. **D17 is settled in ADR 0012:** first-party customer sessions with no self-service recovery.
7. **Courier providers** - which couriers are used today, and COD cash settlement terms.
8. **Notifications** - whether email or SMS is wanted, or the account order page is sufficient.
9. **Reconciliation cadence** and what counts as sufficient evidence of receipt.
5. Written confirmation of product photography rights, or replacement imagery.
6. Native review of the demo's transliterated Bangla product names.
7. Admin dashboard staffing: who operates it and what roles are needed.
8. Whether the storefront will be deployed publicly; it is currently `noindex`.
