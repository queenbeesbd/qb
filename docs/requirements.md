# Requirements

Status: Phase 1 complete for the demonstration scope; production items remain blocked on an authorised backend audit. Traced against `docs/decisions/` and the implemented routes.

## Product context

Bangladeshi cosmetics retailer. The audience is customers comparing brand, pack size, price and availability, frequently on mobile. No primary user research has been conducted - that is an open gap, not an assumption to build on.

Demonstration success: find a product, inspect correct information, choose a quantity, add/update/remove cart items, and switch languages without losing route or cart state.

## Implemented in Phase 1

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Homepage and navigation | Done | Hero, categories, featured, offers; sticky header with desktop nav and mobile drawer |
| D2 | Categories and listings | Done | `/products` plus 5 `/categories/[slug]` routes; result counts; direct reload and back/forward work |
| D3 | Search, filter, sort | Done | URL-driven search across name/brand/pack/tags, category and brand filters, 4 sort options, clear-all |
| D4 | Product detail | Done | Price hierarchy, brand, pack, availability note, quantity, add to cart, source link, explicit missing-description state |
| D5 | Variants and availability | Partial | Availability published as a dated snapshot with a visible caveat. No variant grouping, because the storefront publishes no confirmed groups, so similar shade names remain separate products |
| D6 | Recently added | Not shown, by design | No reliable date field exists; the homepage states this instead of fabricating order |
| D7 | Hot deals | Done | Only records with a published comparison price above the current price; savings and a floored percentage are derived, never stored |
| D8 | Cart and quantity | Done | Add/update/remove, duplicate lines merged, empty state, derived integer totals, demo-only notice |
| D9 | Responsive and accessible | Done (headless-verified) | No overflow 320-1440px; keyboard focus trap and Escape in the drawer; skip link; reduced motion; 40px targets |
| D10 | Language switching | Done | Whole-UI toggle, persistence, `documentElement.lang`, per-field content fallback |
| D11 | Non-happy paths | Done | Empty search, empty category, empty cart, unknown product (404), corrupt storage, unsupported locale, error boundary |
| D12 | Honest demo presentation | Done | Persistent demo notice on every route, inert checkout, `robots: noindex, nofollow` |

## Normalized catalog contract (implemented)

Provenance in `docs/catalog.md`; types in `src/lib/types.ts`:

- `id`, `slug`, `sourceProductId`, `sourceUrl`, `capturedAt` - stable identity plus traceable provenance.
- `name`, `description` - `{ bn, en }`, either side nullable, explicit fallback.
- `brand`, `pack`, `categoryId`, `tags` - `null` when unverified.
- `priceMinor`, `compareAtPriceMinor` - integer poisha; comparison must exceed current.
- `availability` - `in_stock | out_of_stock | unknown`, published snapshot only.
- `images[]` - `sourceUrl`, `localPath`, localized `alt`, `rights` marker.
- `addedAt` - `null` for every record, because no verified dates exist.
- `featured` - explicit demo curation flag, not a popularity claim.
- `isDemo: true` - literal marker on every record.

## Bilingual requirements (implemented)

Central dictionaries with semantic namespaced keys; no scattered conditionals; no runtime machine translation; no hardcoded interface text in the implemented scope. Per-field product fallback is documented in ADR 0002. The toggle is keyboard accessible, visibly labelled and persistent. Bangla typography is verified for rendering, wrapping and line-height; Bengali digits and the taka sign are used in Bangla, Latin digits and `Tk` in English, with stored values never affected.

`npm run check:i18n` enforces 124-key parity and matching placeholder tokens.

## Production requirements (not started)

Each depends on the authorised backend audit. No capability is presumed.

| Domain | Requirement |
| --- | --- |
| Accounts | Supported login/recovery/session lifecycle, guest policy, object-level authorization |
| Checkout | Server-priced totals, delivery quotes, idempotent order creation, confirmation and history |
| Delivery | Service areas, costs, COD eligibility, courier integration - no policy is published today |
| Payments | Provider-supported methods, sandbox, signed notification verification, refunds, reconciliation |
| Inventory | SKU/option mapping, live stock, reservation policy, stale-cart recovery |
| Admin | Merchant backend remains the system of record if it supports the required operations |
| Support | Verified contact channels, order notifications, failure handling |
| Operations | Redacted logs, monitoring, backups with a tested restore, rollback |
| Deployment | Approved domain and hosting, TLS, security headers, secret management, privacy policy |

## Deferred or optional

Wishlist, reviews, brand pages, compare, recently viewed, coupons, bundles, chat ordering, cart drawer, sticky mobile CTA, localized SEO URLs, analytics with consent. Adopt only with reliable data, rights, backend support and demonstrated value. Explicitly excluded: loyalty platform, native app, recommendation engine, fake reviews, skin-diagnosis features.

## Open questions for the owner

1. Backend audit scope, test tenant and access date.
2. Product image rights, and whether the merchant will publish Bangla product copy.
3. Native review of the demo's transliterated Bangla product names.
4. Delivery, return and payment rules - none may be published until approved.
5. Whether the demo will later be deployed publicly; it is currently `noindex`.
