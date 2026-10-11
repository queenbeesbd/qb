# Merchant backend capability audit

Audit date: 2026-10-11. Phase 7. Evidence labels: **Observed** = seen in this audit against the live system; **Documented** = stated by the provider in writing; **Inferred** = reasonable interpretation needing confirmation; **Unknown** = not established.

This audit is **read-only**. No product, category, order, customer, stock, price, setting or account was created, edited or deleted. No order, payment, refund, message or export was initiated. No customer record was opened. No vulnerability scan, fuzzing or load test was performed.

> **Status update (Phase 8, 2026-10-11): this audit is now reference material only.** The owner has approved an **independent-platform direction** (`docs/decisions/0004-independent-platform-direction.md`). QueenBee's builds its own backend, database and admin dashboard; the Zatiq platform is a UX and feature reference, not an integration target. The findings below remain useful for two purposes: understanding familiar merchant workflows when designing QueenBee's own dashboard (`docs/admin-dashboard.md`), and understanding what the platform does *not* provide. Nothing here is an integration plan, and the blocking questions in section 7 are closed by the strategic decision rather than answered by the vendor.

## 1. Access method and environment classification

### Access method

- A local headless Chromium was driven over the DevTools Protocol by a script under `/tmp`, using only Node built-ins. This is the same technique the repository's `scripts/verify-browser.cjs` already uses; **no dependency was added to the project**.
- Credentials were read from the local `.env` **inside the Node process only**. Values were never printed, logged, screenshotted, written to source, or copied into documentation. Credentials were typed into the form with `Input.insertText`, so they never appeared in a JavaScript expression either.
- `.env` remains untracked and ignored (`.gitignore:10`). No `.env.example` exists. No `process.env` usage exists in application code.

### Credential inventory (names only)

`.env` holds three colon-delimited keys: `mail`, `Pass`, `site`. `site` resolves to `https://merchant.zatiqeasy.com` — the merchant dashboard. No secret value is reproduced anywhere in this repository.

### Environment classification: **PRODUCTION, multi-tenant third-party SaaS**

| Evidence | Observation |
| --- | --- |
| Response headers | `server: Vercel`, `x-powered-by: Next.js`, `strict-transport-security: max-age=63072000` |
| Root behaviour | `307` redirect from `/` to `/onboarding` (unauthenticated) |
| Product identity | Page title `Zatiq Easy - eCommerce Builder`; the vendor is Zatiq (zatiq.com / zatiqeasy.com) |
| Tenant model | Shared application serving many merchants; merchant is a tenant, not the system owner |
| Staging | **None provided and none discovered.** No test tenant, no sandbox indicator, no environment switcher |

**Consequence:** every inspection was restricted to non-destructive reading of this one tenant's own records. This is the live production platform. The frontend is a *custom* Next.js application while the platform also ships its own hosted storefront — a structural fact that shapes the whole integration question.

## 2. Modules observed

The authenticated sidebar exposes these modules (labels as displayed):

| Group | Modules |
| --- | --- |
| Core commerce | Dashboard (`/`), Orders (`/order`), Products (`/inventory`), Categories (`/category`), Customers (`/customer`) |
| Fulfilment | Courier |
| Shop & Growth | Manage Shop (`/manage-shop`), Analytics (`/reports`), Themes, Theme Builder, Landing Pages, Mobile App, Spotlights, Abandoned Cart, Promo Codes (`/manage-promocode`), Zatiq Experts, ZatiqGO |
| Settings | Users & Permissions (`/manage-users`), Subscription (`/subscription`) |
| Resources | Report an Issue, My Reports, Zatiq Academy, Zatiq SecurePay, Affiliate Program |

**Manage Shop** expands into: Shop Settings, Shop Domain, Shop Policy, Delivery Support, Payment Gateway, SEO & Marketing Integrations, SMS Support, Chat Support, Social Links, Blocklist, Order Limits, Customer Accounts, Abandoned Cart.

Account menu offers Profile, Report an Issue and **Logout**. No shop switcher is present.

## 3. Confirmed capabilities (Observed)

Only what was directly seen is listed here. A page existing is **not** treated as proof that a capability is usable by an integration.

### Authentication

- Credential login on the dashboard origin via a NextAuth-style flow. Network calls observed: `GET /api/auth/session`, `GET /api/auth/providers`, `GET /api/auth/csrf`, `POST /api/auth/callback/credentials`. Login succeeded on the first attempt; no MFA challenge was presented.
- Logout control present in the account menu (not exercised).

### Application API surface (Observed, **not** a documented integration contract)

The dashboard calls a **separate API origin**, `https://easybill.zatiq.tech`, cross-origin with CORS preflight (`OPTIONS`) preceding each `GET`:

| Endpoint | Version |
| --- | --- |
| `/api/v1/profile` | v1 |
| `/api/v1/categories` | v1 |
| `/api/v1/app-request/has-ready` | v1 |
| `/api/v2/products` | v2 |
| `/api/v2/subscription/entitlements` | v2 |

**This is the platform's private application API, discovered by observing the dashboard's own traffic.** It is not advertised, versioned for third parties, or documented as an integration surface. Treating it as a supported contract would be a serious and unapproved assumption.

### Products

- A product list view with URL-driven paging (`/inventory?page=1&per_page=20`), controls `Add Product`, `Show All`, and a search field.
- An empty state: *"Your inventory is currently empty"* / *"Let's get started by adding your first item now"* / `Add First Item`.

### Categories

- A category list view with an `Add Categories` control. No rows were present.

### Orders

- Order list with tabs defining the **order status lifecycle**: `All Orders`, `Placed`, `On Hold`, `Confirmed`, `Shipped`, `Delivered`, `Completed`, `Cancelled`, `Returned`, `Payment OnProcess`, `Payment Failed`.
- Controls: `Create Order`, `Export`, `Filters`, `Columns`, and a search field.

### Manage Shop sections

Section headings observed (contents behind them were **not** verified): Shop Settings, Shop Domain, Shop Policy, Delivery Support, Payment Gateway, SEO & Marketing Integrations, SMS Support, Chat Support, Social Links, Blocklist, Order Limits, Customer Accounts, Abandoned Cart.

## 4. Unverified capabilities

Everything below is **Unknown** and must not be planned against until verified.

| Area | What is unknown |
| --- | --- |
| Product schema | Field set for name, brand, category, images, description, language; which fields are mandatory, optional, derived or absent |
| Identifiers | Whether products carry a stable id, SKU, or slug, and whether any of them are exposed to the storefront |
| Variants | Whether variants/options exist, and how they map to SKUs and to stock |
| Pricing | How current price, comparison price and discounts are represented; whether discounts are stored, derived or campaign-scoped |
| Stock | Whether stock is tracked, whether it is variant-level, and whether it is reserved during checkout |
| Status | Publication/draft controls and whether they affect the public storefront |
| Featured/collections | Whether any curation or collection concept exists |
| Categories | Taxonomy depth, parent/child, ordering, visibility, localized names, images |
| Orders API | Whether orders are reachable programmatically, and with what authorization |
| Customers | Whether customer records exist, guest checkout support, and PII exposure |
| Shipping | Delivery areas, charges, conditional rules, COD, tracking |
| Payments | Providers, server-side verification, webhooks/callbacks, refunds, reconciliation |
| Duplicate protection | Idempotency and duplicate-order controls |
| Integration surface | Any documented API, API keys, webhooks, supported integrations, import/export format |
| Limits | Rate limits, quotas, timeouts, error semantics, retry behaviour |
| Environment | Whether a staging/test tenant can be provisioned |

**The `Add Product` form could not be read.** `/inventory/new` rendered no fields in headless Chromium, so the product field model remains unverified. This is the single most important gap for catalog integration.

### No documented integration surface found

The vendor's public homepage exposes no API, developer, webhook or integration link. No API documentation, token-management interface, or webhook configuration was found inside the dashboard. **No supported integration mechanism has been identified.**

## 5. Frontend-to-backend field mapping

"Verified field" below means *verified to exist and be readable by an integration*. Nothing in this table meets that bar yet, so every backend column is Unknown or a named dashboard surface.

| Frontend concern | Current source | Backend capability | Required mapping | Uncertainty |
| --- | --- | --- | --- | --- |
| Product identity | `src/data/catalog.ts` `id`, `slug`, `sourceProductId`, `sourceUrl` | Unknown. `sourceProductId` was captured from the public storefront URL pattern, not from an API | Replace fixture ids with the platform's authoritative product id; keep a stable local alias if ids are not public | **High** |
| Categories | `src/data/categories.ts`, 5 hand-assigned categories | Category module exists; taxonomy unknown | Map merchant taxonomy to the current 5 categories, or adopt the merchant's taxonomy and re-cut navigation | **High** |
| Prices / discounts | `priceMinor`, `compareAtPriceMinor` as integer poisha, discount derived | Price/discount representation unknown | Server remains authority; frontend must only display a server-computed value | **High** |
| Variants / SKUs | Not modelled at all | Unknown | Introduce a variant dimension only if the platform has one; otherwise keep single-SKU products | **High** |
| Inventory | `availability` snapshot with a visible caveat | Stock tracking unknown | Freshness window, and a decision on what to show when stock is unknown | **High** |
| Featured products | `src/data/curation.ts` id lists (featured ≤6, collection ≤8) | Unknown; no curation concept observed | Keep curation local unless the platform exposes collections | **Medium** |
| Orders | Simulated checkout, inert by design | Order module and status lifecycle observed | Not implemented; requires server-side order creation | **High** |
| Shipping / payments | Unintegrated | Sections exist (`Delivery Support`, `Payment Gateway`) | Business rules and provider contracts needed before any design | **High** |
| Bilingual content | `{ bn, en }` per field with per-field fallback | Unknown; the live storefront publishes English product names only | Determine whether the platform can store Bangla copy; otherwise keep the documented fallback | **High** |
| Images | Local WebP/JPEG sets keyed in `src/lib/images.ts` | Platform hosts imagery at `assets.zatiqeasy.com` | Decide whether to serve platform-hosted imagery or keep local derivatives; rights still unresolved | **Medium** |

## 6. Security and integration risks

Risks below are stated from evidence gathered in this audit.

### R1 — Tenant/catalog mismatch (**Critical, blocking**)

The authenticated tenant reports **0 products and 0 categories**. The live storefront `queenbees.sellbd.shop` publishes **24 product links** and serves product imagery from a Zatiq shop path carrying shop id **42239**. If the audited account does not own that shop, this audit describes the wrong tenant and every capability conclusion must be re-established against the correct one. **Unresolved.** See section 7.

### R2 — No supported integration surface (**Critical**)

The only API discovered is the dashboard's private application API on `easybill.zatiq.tech`, reached with the merchant's own session. Building the storefront on an undocumented internal API would create unowned coupling: it can change without notice, is not versioned for consumers, and offers no support commitment. **Recommendation:** obtain a written supported-integration statement from the provider before any integration design.

### R3 — Client-side authority (**Critical, already mitigated in the demo**)

Prices, discounts, stock and totals are currently computed from local fixtures. Production must never trust the browser. The existing `docs/architecture.md` trust boundary already states this; it stays unchanged and becomes mandatory at integration time.

### R4 — Authentication placement (**High**)

Merchant credentials must never reach the storefront bundle or browser. The storefront must not log into the merchant dashboard at all: a shopper-facing app has no business holding merchant-tenant credentials. Any catalog read must go through a server-side boundary using a least-privilege credential held only on the server.

### R5 — Cross-origin and cookie constraints (**Medium**)

The dashboard authenticates on `merchant.zatiqeasy.com` while calling `easybill.zatiq.tech`, with CORS preflight. Session-cookie or bearer requirements, and whether an out-of-band client is even permitted, are **unverified**. Any server-to-server call must be tested against the provider's terms, not assumed.

### R6 — Payment verification and duplicate orders (**High, not yet applicable**)

`Payment OnProcess` and `Payment Failed` statuses indicate asynchronous payment handling. If the platform handles payment, order status must be reconciled from the platform rather than inferred by the storefront, and order creation must be idempotent. Nothing here is verified; no payment path may be designed yet.

### R7 — Third-party tracking on the dashboard (**Medium, informational**)

Google Tag Manager, Google Analytics, Google Ads/DoubleClick, Meta Pixel and Microsoft Clarity were all observed loading on the merchant dashboard. This affects the *dashboard*, not the storefront, and is the platform's own behaviour. It is recorded because it constrains any future decision to embed dashboard surfaces, and because the storefront currently loads **zero** third-party scripts — a property worth preserving.

### R8 — Customer data handling (**High, by policy**)

No customer record was opened and no PII was captured. Any future work involving orders or customers must define lawful basis, minimisation, retention and access control before a single record is read.

### R9 — No rate-limit or error semantics (**Medium**)

Unknown limits mean an integration could hammer a shared multi-tenant platform. Any integration must start with conservative caching, backoff and a circuit breaker.

## 7. Required provider documentation or owner decisions

### Blocking the next step

1. **Which shop does the provided credential own?** The audited account shows an empty catalog; the live storefront shows 24 products under shop id 42239. Confirm whether these are the same shop. If not, provide credentials (or read access) for the correct tenant.
2. **Is a staging or test tenant available?** None exists today. If the answer is no, state explicitly that the platform has no non-production environment, and accept that any future write testing would occur in production.

### Required before integration design

3. **Does the provider offer a documented API or supported integration?** If yes, obtain the documentation, authentication model and terms of use. If no, the integration approach changes fundamentally.
4. **Which operations would be permitted**, and in which environment? Default assumption: read-only.
5. **Confirm prohibited operations in writing:** production writes, real orders, live payments, customer-data access, and any testing outside an agreed scope.

### Required before commerce design

6. Approved payment methods and COD eligibility; who verifies payment and how.
7. Delivery areas, charges, lead times and tracking.
8. Inventory semantics: is stock tracked, is it reserved, and what happens on oversell?
9. Order lifecycle ownership: cancellation, returns, refunds, and who reconciles.
10. Guest versus account checkout.

### Non-backend blockers (independent)

11. Written photography reuse permission (or replacement imagery).
12. Native review of the Bangla product names.

## 8. Recommended integration architecture

This is a **proposal**, contingent on section 7 items 1–4. It does not change the accepted architecture in `docs/architecture.md`, which already anticipates an adapter at the data layer.

```text
Browser (storefront)
   |  no merchant credentials, ever
   v
Next.js server  ---  trusted boundary
   |  holds the only credential; owns price/stock/order authority
   v
Provider-supported interface   <-- must be confirmed, not assumed
   |
   v
Zatiq platform (system of record)
```

Principles:

- **Server-only credentials.** Any provider credential lives in a server-side environment variable. It is never exposed through `NEXT_PUBLIC_*`, never shipped to the client, and never committed.
- **Adapter at the existing seam.** `src/data/` already hides the catalog behind typed accessors. A `src/data/backend/` adapter implements the same accessor contract, so no view component changes. This was designed in from Phase 1.
- **Never trust the browser.** Price, discount, stock and totals are recomputed server-side; the client's values are display-only.
- **Cache with intent.** Catalog reads should be cached and revalidated on a defined interval rather than fetched per request, both for latency and to avoid loading a shared platform. Exact freshness targets depend on unknown rate limits.
- **Fail closed, degrade honestly.** If the backend is unavailable, the storefront must state the gap rather than serve stale prices as current. The existing "not published" pattern is the model.
- **Preserve the demo boundary until replaced.** The inert checkout, locked demo announcement and `noindex` stay until a real, authorized checkout exists.

## 9. Proposed smallest viable vertical slice

**A read-only catalog integration** — the smallest change that proves the architecture without touching money, orders or customer data.

| Aspect | Proposal |
| --- | --- |
| Scope | Read products and categories for the storefront catalog only. No writes, no orders, no customers, no payments. |
| Data source | The provider's **supported** interface. If none exists, the slice cannot proceed as specified. |
| Boundary | `src/data/backend/` adapter implementing the existing accessor contract. |
| Product identity | Keep the platform's id as authoritative; retain `slug` for URLs and a local alias for curated id lists. |
| Categories | Map platform categories to the current 5, or adopt the platform taxonomy and re-cut navigation. |
| Price authority | Server reads and computes; the client only displays. Comparison price shown only when genuinely greater. |
| Inventory | Treat as a timestamped snapshot with a visible freshness statement until live semantics are known. |
| Bilingual | Keep `{ bn, en }` with per-field fallback; Bangla stays absent until the platform stores it. |
| Errors | Unknown product/category degrades to the existing empty states; backend failure states the gap, never invents data. |
| Caching | Server-side cache with revalidation; conservative until rate limits are known. |
| Verification | Product count and field-by-field parity against the platform; price equality; no client-side credential; no regression in the existing suites. |
| Rollback | The adapter is behind the existing accessors, so reverting to local fixtures is a single switch. |

**Explicitly excluded from the slice:** order creation, checkout, payment verification, inventory mutation, customer data, and any production write.

**If a read-only catalog integration is not supported**, the next safest option is to keep the local catalog as the display source and make the merchant the system of record for orders only once an order path is authorized — but that still requires a supported order interface, so the provider question must be answered first either way.

## 10. Explicit limitations of this audit

- **The tenant catalog is empty**, so no product, category, order or customer schema could be read from real data.
- **The `Add Product` form did not render** in headless Chromium, so the product field model is unverified.
- **Several pages rendered empty or partially** in headless mode (Customers, Manage Shop detail pages, Users & Permissions, `/inventory/new`). This may be lazy client rendering, bot mitigation, or plan state. Absence of content is **not** evidence that a module is absent or broken.
- **Response bodies could not be captured.** The DevTools Protocol returned `No resource with given identifier found` for the API responses, and an in-page `fetch` was blocked by CORS. So field-level payload structure was not observed.
- **No staging environment exists**, so nothing was verified in a non-production context.
- **No documented API was found**, so no supported integration path is confirmed.
- **No real-device or assistive-technology testing** was part of this audit.
- **Nothing here proves production security.** A read-only audit of one tenant's UI cannot establish authentication strength, authorization correctness, payment security or platform resilience.
- **The dashboard is a third-party platform.** Zatiq controls its roadmap, its API and its terms; the merchant controls only their own tenant configuration.
