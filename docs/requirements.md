# Requirements

Status: Phases 0-7 are complete as verified in `docs/project-status.md`. The Phase 7 merchant-backend audit (`docs/backend-capability-audit.md`) found no supported integration surface and an empty tenant catalog. The owner has since **approved an independent-platform direction** (`docs/decisions/0004-independent-platform-direction.md`), so the merchant platform is now a UX and feature reference only, not a dependency.

**Product model (ADR 0008).** QueenBee's is a **single-store, owner-operated e-commerce platform**: one store owner sells that store's own goods directly to that store's own customers. It is **not** a marketplace, a multi-vendor platform, a SaaS store builder or a hosted platform on which other businesses create stores. There are no third-party merchants, no vendor onboarding, no seller dashboards, no commissions, no marketplace payouts and no tenant isolation - because there is nothing to isolate. See `docs/decisions/0008-single-store-product-model.md`.

## Approved strategic direction

Owner-approved 2026-10-11. Full reasoning in `docs/decisions/0004-independent-platform-direction.md`; architecture in `docs/platform-architecture.md`.

### Platform ownership

| ID | Requirement | Status |
| --- | --- | --- |
| S1 | QueenBee's owns its own backend and database | Approved; not built |
| S2 | QueenBee's owns its own admin dashboard | Approved; not built |
| S3 | QueenBee's owns the product catalog, pricing, inventory, orders, customers, shipping, promotions and analytics data | Approved; not built |
| S4 | Explicit server-side authority for prices, discounts, inventory and order creation | Approved; **not yet implemented anywhere** - the current storefront is a client-side demo |
| S5 | Infrastructure and architecture chosen for this project's needs, not Zatiq's implementation | Approved; stack selection pending owner decision |
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
| Accounts | **Account required before ordering (D12, approved).** Guests may browse and build a cart; login or registration is required to place an order, with the cart preserved and the customer returned to checkout. Requires a supported login/recovery/session lifecycle and object-level authorization |
| Checkout | Server-priced totals, delivery quotes, idempotent order creation, confirmation and history |
| Delivery | Service areas, costs, COD eligibility, courier integration - no policy is published today |
| Payments | Manual bKash/Nagad verification (approved), COD with owner approval before dispatch (approved), exceptions queue for unverified genuine payments, **24-hour unpaid-order expiry** that never touches an order with a submitted claim, and no automated gateway |
| Refunds | Manual through support, with `refund_status` separate from `payment_status` and distinct requested / processing / completed / failed states. **Approved (D9):** a refund is recorded as completed only when the real-world action is confirmed; stock returns to sellable before dispatch, or after delivery only once goods are physically received and inspected |
| Inventory | SKU/option mapping, live stock, reservation policy, stale-cart recovery |
| Admin | **QueenBee's own admin dashboard is the system of record.** Scope and launch-critical split in `docs/admin-dashboard.md` |
| Imagery | Written confirmation of photography rights, or replacement assets |
| Support | Verified contact channels, order notifications, failure handling |
| Operations | Redacted logs, monitoring, backups with a tested restore, rollback |
| Deployment | Approved domain and hosting, TLS, security headers, secret management, privacy policy |

## Deferred or optional

Wishlist, reviews, brand pages, compare, recently viewed, coupons, bundles, chat ordering, cart drawer, sticky mobile CTA, localized SEO URLs, analytics with consent. Explicitly excluded: loyalty platform, native app, recommendation engine, fake reviews, skin-diagnosis features.

## Open questions for the owner

The backend-audit question is now closed: the direction is an independent platform, so there is no vendor access to obtain.

**Approved (2026-10-11):** D1 Neon PostgreSQL, D2 Vercel, D3 Neon Object Storage, D7 manual bKash + manual Nagad + COD, D8 required sender number and transaction reference with no screenshot, D9 payment and order policy, D11 inventory reservation and release, D12 account-required checkout.

**D9 is approved.** Binding: the **24-hour verification maximum** (internal, explicitly not a customer-facing promise); the exceptions queue for genuine payments that cannot be verified in time; **fake-order findings** with an audited reason and actor and a separate customer review flag; **cancellation through support**; **manual refunds** with separate requested/processing/completed/failed states; **COD owner approval before dispatch**; the five-way separation of payment status, order status, refund status, reservation state and customer flag; a **24-hour unpaid-order expiry** that applies only to orders with no submitted claim and never revives a reservation silently; **cancellation after the window** as a pre-dispatch support decision or a post-dispatch return; and the **full COD lifecycle** with return-to-store and separate delivery, cash-collection and reconciliation states.

**D11 is approved.** The **first submitted payment claim gets the product**, and **at most one active submitted claim exists per unit**. Atomic allocation, no oversell, idempotent release and inspection-before-restoration are binding.

**No question blocks Phase 10.**

**Open but not blocking Phase 10:**

5. **Payment recipient accounts** - which merchant numbers, under what account name (stored as settings).
6. **Staff authentication approach** and the roles permitted to verify payments and record refunds (D10, D13).
7. **Courier providers** - which couriers are used today, and COD cash settlement terms.
8. **Notifications** - whether email or SMS is wanted, or the account order page is sufficient.
9. **Reconciliation cadence** and what counts as sufficient evidence of receipt.
5. Written confirmation of product photography rights, or replacement imagery.
6. Native review of the demo's transliterated Bangla product names.
7. Admin dashboard staffing: who operates it and what roles are needed.
8. Whether the storefront will be deployed publicly; it is currently `noindex`.
