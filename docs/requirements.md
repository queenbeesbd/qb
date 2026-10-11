# Requirements

Status: Phase 1 built the storefront; Phase 2 (2026-10-11) refined imagery, hero, featured shelf, announcement configuration and typography. Production items remain blocked on an authorised backend audit.

## Product context

Bangladeshi cosmetics retailer. The audience is customers comparing brand, pack size, price and availability, frequently on mobile. No primary user research has been conducted - that is an open gap, not an assumption to build on.

Demonstration success: find a product, inspect correct information, choose a quantity, add/update/remove cart items, and switch languages without losing route or cart state.

## Implemented

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Homepage and navigation | Done | Hero with product composition, categories, featured shelf, offers |
| D2 | Categories and listings | Done | `/products` plus 5 `/categories/[slug]`; counts; reload and back/forward |
| D3 | Search, filter, sort | Done | URL-driven search across name/brand/pack/tags, category and brand filters, 4 sorts, clear-all |
| D4 | Product detail | Done | 3:4 photo with source note, price hierarchy, brand, pack, availability note, quantity, add to cart, explicit missing-description state |
| D5 | Variants and availability | Partial | Availability is a dated snapshot with a visible caveat. No variant grouping - the storefront publishes no confirmed groups |
| D6 | Recently added | Not shown, by design | No reliable date field exists; the homepage states this instead of fabricating order |
| D7 | Hot deals | Done | Only records with a published comparison price above current; savings and floored percentage derived |
| D8 | Cart and quantity | Done | Add/update/remove, duplicate lines merged, empty state, derived integer totals |
| D9 | Responsive and accessible | Done (headless-verified) | No overflow 320-1440px; drawer focus trap and Escape; skip link; reduced motion; 40px targets |
| D10 | Language switching | Done | Whole-UI toggle, persistence, `documentElement.lang`, per-field content fallback |
| D11 | Non-happy paths | Done | Empty search, empty category, empty cart, unknown product (404), corrupt storage, unsupported locale, error boundary |
| D12 | Honest demo presentation | Done | Locked announcement strip on every route, inert checkout, `robots: noindex, nofollow` |
| D13 | Authentic product imagery | Done | 16 products with locally served WebP/JPEG at 3:4, provenance recorded, rights pending confirmation |
| D14 | Featured shelf navigation | Done | Two rows, group advance, controls bounded and disabled at ends, keyboard reachable, no dependency |
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
- `featured` - explicit demo curation flag, not a popularity claim.
- `isDemo: true` - literal marker on every record.

## Bilingual requirements

Central dictionaries with semantic namespaced keys; no scattered conditionals; no runtime machine translation; no hardcoded interface text. Per-field product fallback per ADR 0002. The toggle is keyboard accessible, visibly labelled and persistent. Bangla typography is verified for rendering, wrapping and line-height, and negative letter-spacing is explicitly disabled for Bengali. `npm run check:i18n` enforces 130-key parity and matching placeholder tokens.

## Production requirements (not started)

| Domain | Requirement |
| --- | --- |
| Accounts | Supported login/recovery/session lifecycle, guest policy, object-level authorization |
| Checkout | Server-priced totals, delivery quotes, idempotent order creation, confirmation and history |
| Delivery | Service areas, costs, COD eligibility, courier integration - no policy is published today |
| Payments | Provider-supported methods, sandbox, signed notification verification, refunds, reconciliation |
| Inventory | SKU/option mapping, live stock, reservation policy, stale-cart recovery |
| Admin | Merchant backend remains the system of record if it supports the required operations |
| Imagery | Written confirmation of photography rights, or replacement assets |
| Support | Verified contact channels, order notifications, failure handling |
| Operations | Redacted logs, monitoring, backups with a tested restore, rollback |
| Deployment | Approved domain and hosting, TLS, security headers, secret management, privacy policy |

## Deferred or optional

Wishlist, reviews, brand pages, compare, recently viewed, coupons, bundles, chat ordering, cart drawer, sticky mobile CTA, localized SEO URLs, analytics with consent. Explicitly excluded: loyalty platform, native app, recommendation engine, fake reviews, skin-diagnosis features.

## Open questions for the owner

1. Backend audit scope, test tenant and access date.
2. Written confirmation of product photography rights, and whether watermark-bearing images are acceptable.
3. Native review of the demo's transliterated Bangla product names.
4. Delivery, return and payment rules - none may be published until approved.
5. Whether the demo will later be deployed publicly; it is currently `noindex`.
