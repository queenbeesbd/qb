# QueenBee's storefront (demo)

A bilingual (Bangla/English) cosmetics storefront for QueenBee's, a Bangladeshi cosmetics retailer. Built as a **client-ready frontend demonstration**: the shopping experience is complete and interactive, but no order, payment or delivery is real.

- Public catalog source: https://queenbees.sellbd.shop/
- Functional reference (patterns only, no assets copied): https://ghorerbazar.com/
- Merchant backend: https://merchant.zatiqeasy.com/ - **not accessed, not integrated**

> **This is a demonstration.** Checkout is a preview with no form, no payment fields and no submit path. No data leaves the browser. See [Known limitations](#known-limitations).

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.4.0 (App Router, Turbopack) |
| Language | TypeScript 5.9.3, `strict` + `noUncheckedIndexedAccess` |
| Runtime | Node >= 20.9.0 (verified on Node 26.11.1) |
| Package manager | npm 12.2.0, lockfile committed |
| Styling | CSS Modules + CSS custom-property tokens |
| Rendering | Server Components by default; Client Components only for cart, locale, filters, drawer |
| Data | Local typed fixtures in `src/data/` (no API calls at runtime) |
| i18n | Central typed dictionaries, `useSyncExternalStore` locale store |
| Tests | Zero-dependency integrity scripts + a CDP-driven Chromium smoke suite |

No database, ORM, auth provider, CMS, state-management library, UI component library or animation library is used. See [ADR 0001](docs/decisions/0001-nextjs-typescript-foundation.md).

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build and serve:

```bash
npm run build
npm run start        # http://localhost:3000
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:catalog` | Catalog integrity: ids, slugs, prices, categories, local image files |
| `npm run check:i18n` | Bangla/English key parity and placeholder-token equality |
| `npm run verify:browser` | 31-check Chromium journey suite (requires a running server) |

Browser suite usage:

```bash
npm run build
npx next start -p 4311 &
npm run verify:browser          # defaults to http://127.0.0.1:4311
```

It drives a local Chromium over the DevTools Protocol using only Node built-ins (`node:http` plus the global `WebSocket`), so no test dependency is added. It requires `chromium` on `PATH`; if it is unavailable, run the other five checks and treat browser behaviour as unverified.

## Routes

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | Static | Hero, categories, featured, verified offers, explicit "recently added" gap notice |
| `/products` | Server-rendered | Search, category/brand filter, sort; all state in the query string |
| `/categories/[slug]` | Server-rendered | Five reviewed categories |
| `/products/[slug]` | Prerendered (16) | Gallery placeholder, price hierarchy, quantity, add to cart, related products |
| `/cart` | Static | Quantity editing, removal, derived totals, empty state |
| `/checkout` | Static | Inert demo preview - no form, no payment, no submission |
| `/_not-found` | Static | Localized not-found |

Search, filter and sort are URL-driven, so every view is linkable, refreshable and back/forward-safe.

## Internationalization

Bangla is the default. The toggle in the header switches the entire interface and persists the choice in `localStorage` under `queenbees.locale.v1`. Interface copy lives in `src/i18n/dictionaries.ts`; components never hardcode text or branch on locale. Product and category content is `{ bn, en }` with a documented per-field fallback. Prices are stored as integer poisha and **never change with locale** - only the digit style and currency prefix do. See [ADR 0002](docs/decisions/0002-bilingual-content-strategy.md).

## Project layout

```
src/
  app/                  routes, layout, shared chrome, global tokens
  components/           header, footer, cards, stepper, icons
  features/catalog/     query parsing, selection, home and catalog views
  features/cart/        cart store, provider, view
  features/checkout/    inert checkout preview
  i18n/                 dictionaries, locale config, store, provider, hook
  lib/                  domain types, integer money, formatting
  data/                 reviewed demo catalog and categories
scripts/                catalog and i18n integrity checks, browser suite
docs/                   audit, requirements, design, security, plan, ADRs
public/brand/           original SVG wordmark, mark, dark variant, favicon
public/catalog/         16 generated placeholder product images
```

## Known limitations

- **Checkout is simulated.** No order, payment, address or customer data is collected, transmitted or stored.
- **Product photography is not included.** The merchant's images are not redistributed; every product uses a clearly labelled local placeholder pending rights review. See [docs/catalog.md](docs/catalog.md).
- **No "recently added" list.** The public storefront publishes no reliable date-added field, so the homepage states that instead of inventing one.
- **No product descriptions.** The public pages publish none; the product page says so rather than generating copy.
- **Bangla product names are transliterations** prepared for this demo and require native review.
- **Stock is a snapshot**, not live inventory. It reflects the public listing on the capture date.
- **The merchant backend was not audited.** No price, stock, discount, authorization or payment value from the client is trusted anywhere in this codebase.
- **Not verified:** real iOS Safari and Android Chrome devices, screen reader output on real assistive technology, and any production security control.

## Documentation

- [Agent rules](AGENTS.md)
- [Repository and storefront audit](docs/project-audit.md)
- [Reference pattern analysis](docs/reference-analysis.md)
- [Requirements](docs/requirements.md)
- [Design system](docs/design-system.md)
- [Architecture](docs/architecture.md)
- [Security and threat model](docs/security.md)
- [Demo catalog provenance](docs/catalog.md)
- [Implementation plan](docs/implementation-plan.md)
- [Decisions](docs/decisions/)

## Next phase

An **authorised merchant-backend capability audit and integration plan**. Real checkout, delivery charges, payment verification and inventory consistency all depend on backend capabilities that have not been inspected. That phase must not begin without explicit authorisation, credentials and a defined test scope.
