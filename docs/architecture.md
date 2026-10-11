# Architecture

Status: current implementation is the Phase 1 frontend-demo architecture, refined through Phases 2-5; verified audit snapshot: 2026-10-11. Decisions recorded in `docs/decisions/`. This describes what exists, not a proposal.

## Applied stack

Next.js 16.4.0 (App Router, Turbopack), TypeScript 5.9.3 in strict mode with `noUncheckedIndexedAccess`, npm with committed lockfile, CSS Modules plus CSS custom-property tokens, Server Components by default. No database, ORM, auth provider, CMS, state library, UI kit or animation library. Rationale: [ADR 0001](decisions/0001-nextjs-typescript-foundation.md).

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/lib/` | Domain types (`Product`, `Category`, `LocalizedText`, `CartLine`), integer-poisha money helpers, display formatting and search normalisation. No React, no framework imports. |
| `src/data/` | Reviewed demo catalog and categories plus typed accessors. The only place product facts live. |
| `src/i18n/` | Dictionaries, locale config, locale external store, provider, translation hook. |
| `src/features/catalog/` | Query parsing/selection, homepage view, catalog view, product detail view. |
| `src/features/cart/` | Cart external store, storage guards, provider with all derived money, cart view. |
| `src/features/checkout/` | Inert demo checkout preview. |
| `src/components/` | Shell components and presentational primitives (header, footer, card, stepper, icons). |
| `src/app/` | Routes, root layout, global tokens, error/not-found boundaries. |

Dependency direction is one-way: `app` and `features` may import `components`, `lib` and `data`; `lib` and `data` import nothing upward. Components never compute money - they read it from the cart provider or the money helpers.

## Rendering and data flow

```text
Server                                   Client
------                                   ------
route params / searchParams
  -> parseCatalogQuery (untrusted input -> safe defaults)
  -> selectCatalog(products, query)      -> ProductCard / grid (presentational)
  -> ProductDetailView (client)          -> useCart / useTranslation
```

- Routes resolve their own data on the server. `/products` and `/categories/[slug]` are server-rendered; the 22 product routes are prerendered via `generateStaticParams`; `/`, `/cart`, `/checkout` and `/_not-found` are static.
- `parseCatalogQuery` treats `searchParams` as untrusted: it truncates lengths, validates the category against the real taxonomy, and falls back to `relevance` for an unknown sort. Malformed input cannot crash a listing page.
- Client Components are limited to `Header`, `Footer`, `LanguageToggle`, `ProductCard`, `QuantityStepper`, `HomeView`, `CatalogView`, `ProductDetailView`, `CartView`, `CheckoutPreview`, the providers, and the error/not-found boundaries. Everything else is server-rendered.

## State model

Two small external stores, both read with `useSyncExternalStore` so the server snapshot is deterministic and no effect has to write state on mount:

| Store | Server snapshot | Client snapshot | Persistence |
| --- | --- | --- | --- |
| `src/i18n/locale-store.ts` | `'bn'` (approved default) | saved preference | `queenbees.locale.v1` |
| `src/features/cart/cart-store.ts` | frozen empty list | restored lines | `queenbees.cart.v1` |

Persisted values are treated as untrusted on read: the cart filters against known product ids, de-duplicates, clamps quantities to `1..20` with a 40-line cap, and discards unparseable JSON; the locale store discards any value that is not `bn` or `en`. All derived cart money is computed in one place (`CartProvider`) in integer poisha.

## Trust boundaries

```text
Untrusted: browser, URL, localStorage, product copy, future API payloads
    |
    v
This demo: local fixtures -> pure functions -> rendered output
    |  (no outbound requests; no order/payment path exists)
    v
Trusted, NOT YET BUILT: merchant server -> inventory/orders -> payment provider
```

The demo contains no code path that contacts the merchant backend or a payment provider. The checkout route renders zero forms, zero inputs and zero submit buttons, so there is nothing to tamper with and no field to collect personal data. This is a structural guarantee, not a disabled control.

Every value the client holds - price, discount, stock, total - is a **display projection of local fixtures**. It is explicitly not authoritative. A production checkout must recompute all of it on a trusted server; see `docs/security.md`.

## Replacing the fixture catalog

Components depend on the `Product` type and the accessors `getProductBySlug`, `getProductById` and `products`, not on the fixture module internals. An authorised backend adapter can therefore replace `src/data/catalog.ts` without touching any view. The adapter must still keep price/stock authority server-side and preserve the same normalized shape, including explicit `null` for unknown optional fields.

## Where the backend comes from (strategic reset)

The Phase 7 audit found no supported integration surface on the merchant platform. The owner has therefore approved an **independent platform**: QueenBee's builds and owns its own backend, database and admin dashboard. See `docs/decisions/0004-independent-platform-direction.md` for the decision and `docs/platform-architecture.md` for the proposed architecture, evaluated options and the decisions still requiring owner approval.

The Zatiq dashboard is now a **UX and feature reference only**. Nothing in this repository depends on its API, endpoints, cookies or tenant identifiers.

### What does not change

This document's implemented content stands as-is. In particular, the properties below were designed in from Phase 1 and are now load-bearing rather than hypothetical:

- The frontend is **never** authoritative for price, discount, stock, totals or orders.
- Catalog data is reached only through the typed accessors in `src/data/`, so a backend adapter replaces the fixtures without touching a single view component.
- Server Components resolve data on the server, so the trust boundary is already in the right place for a real backend.
- The cart stores ids and quantities only, never prices, so totals are always recomputed.
- The demo's inert checkout, locked announcement and `noindex` remain until a real, authorized checkout exists.

### What is now this project's responsibility

Database and schema, staff authentication and authorization, the admin dashboard, order integrity, payment verification, shipping and courier integration, image storage, analytics and operations. None of these exist yet, and none is implemented by this documentation change.
