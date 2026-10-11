# QueenBee's - agent instructions

## Scope and authority

- Read `README.md` and the relevant `docs/` file before changing code. Phase 0 produced the audit and plan; Phase 1 produced the working storefront.
- Preserve user changes and `.pi/` (harness state, not application infrastructure).
- Ask before: replacing the framework, changing approved requirements, adding a major dependency, or anything irreversible. Reversible conventional choices are yours to make.
- Separate verified facts, assumptions, proposals and unresolved questions. Record significant approved choices in `docs/decisions/`.
- Keep documentation synchronized when an approved decision or requirement changes.

## Architecture constraints (accepted)

- Next.js App Router + strict TypeScript, npm with committed lockfile. See `docs/decisions/0001-nextjs-typescript-foundation.md`.
- Server Components by default; add `'use client'` only where interaction requires it.
- Styling is CSS Modules plus CSS custom-property tokens in `src/app/globals.css`. Use tokens, not raw hex values, in components.
- **All money is integer poisha** (`1 BDT = 100`). Never use floating-point arithmetic for money, and never store a derived discount - derive it.
- Global client state is limited to two external stores (`src/features/cart/cart-store.ts`, `src/i18n/locale-store.ts`) consumed with `useSyncExternalStore`. Do not add a state-management library. Do not call `setState` synchronously inside an effect; the lint rules reject it.
- **Font weights are restricted to 400 / 500 / 600 / 700.** Inter is variable (100-900) but Noto Sans Bengali only ships those four, so any other value renders at different effective weights in the two scripts. Do not introduce 550/650 or intermediate values.
- **Never apply letter-spacing to Bengali text.** Negative tracking distorts conjunct clusters. `html[lang='bn']` resets it for headings; keep it that way.
- **The homepage category section is desktop-only (below 720px it is `display: none`).** Mobile category discovery goes through the header drawer, which lists every category. 720px is deliberately the same breakpoint at which the header's own category navigation appears, so a category link is always reachable through exactly one surface. Do not hide category filtering or the category routes.
- All catalog imagery renders through `src/components/ProductPhoto.tsx`. Never emit a raw `<img>` for a product or hardcode an image path - paths are derived from the image `key` in `src/lib/images.ts`.
- **Curated selections are id lists, never a flag on the product record.** The featured shelf and the "more to explore" collection live in `src/data/curation.ts` as product-id arrays resolved through `getProductById`. Do not reintroduce a `featured` boolean on `Product`, and do not exceed the declared caps (featured 6, collection 8) - `npm run check:catalog` asserts the ids resolve, do not repeat, do not overlap, and stay within cap.
- **Never present curated products as recency, popularity or sales.** The storefront publishes no date-added field, so there is no "recently added" list; the section is named and worded as a curated selection. Do not add a section that implies arrival order.
- **The comparison price is struck through only when it is genuinely greater than the current price.** Gate it on the derived saving being non-null; never print a discount that `discountAmount`/`discountPercent` did not compute.
- **Do not let a horizontally scrolling row widen the page.** Nested grid items need `min-width: 0`, and `overflow-x: auto` alone is not enough - the shelf also needs `contain: layout paint`. See `docs/design-system.md`.
- Catalog data lives in `src/data/` and is reached only through the typed accessors, so an authorised backend adapter can replace it without rewriting components.
- Do not add a database, ORM, auth provider, CMS, UI component library, animation library or test framework without a demonstrated need and approval.

## Design principles

- Minimal, premium, product-led. Purple `#A680FF` and pink `#F6B3CC` are anchors used deliberately; white text on `#A680FF` fails contrast (2.94:1), so use `--color-action` (`#56358C`) for filled actions with white labels, or dark ink on pastel.
- No decorative clutter, gratuitous gradients, excessive rounding, pill-shaped controls by default, arbitrary animation, or generic pink beauty-store styling.
- Desktop and mobile share routes, data and business logic. Mobile may adapt presentation, never behaviour.
- Reference Ghorer Bazar for functional patterns only. Never copy its identity, content, assets or grocery taxonomy, and do not inherit the previous QueenBee's visual design.
- Typography must be verified for Bangla: no letter-spacing on Bengali text, longer base line-height, and no fixed-height text containers.

## Honesty rules (non-negotiable)

- Never invent stock, arrival dates, reviews, ratings, sales counts, authenticity guarantees, ingredient claims, discounts, delivery promises or testimonials.
- When verified data does not exist, state the gap in the interface. The homepage and product pages already do this for dates and descriptions - keep that pattern.
- Label demo behaviour everywhere it could be mistaken for real. The persistent demo notice, the inert checkout route and `robots: noindex` are deliberate and must not be removed.
- Do not describe static markup as tested interaction. Report commands actually run, and the checks that were skipped.

## Security and data

- The frontend is **never** authoritative for prices, discounts, stock, permissions, totals, payment status or orders. Production validation belongs to a trusted server.
- Never put secrets in client bundles, `NEXT_PUBLIC_*` variables, documentation, logs or committed files.
- No merchant backend access, live security testing, order submission or customer-data collection without explicit written authorisation and a defined scope.
- Treat persisted cart/locale data as untrusted: parse defensively, validate ids against the catalog, and clamp numeric values.
- Never render untrusted HTML. Product copy is plain text by design; do not introduce `dangerouslySetInnerHTML` or an unreviewed sanitizer.
- Public image visibility is not a licence. The product photography (22 products) is tagged `rights: 'merchant_source_pending_confirmation'` and is **not** cleared for public launch. Do not relabel it as cleared, and do not add further merchant assets without recorded permission - see `docs/catalog.md`.
- Announcement content lives in `src/data/announcements.ts`, never inline in a component. The `demo-preview` entry is `locked: true`; keep it locked and keep `npm run check:catalog` asserting it. A visible announcement must carry both locales.

## Verification expectations

- Group related checks at phase checkpoints; run targeted checks during development. A passing build is not completion.
- Before declaring work done, run `npm run typecheck`, `npm run lint`, `npm run check:catalog`, `npm run check:i18n`, `npm run build`, and `npm run verify:browser` against a served build.
- Do not weaken `strict`, disable lint rules, or delete checks to obtain a passing result. Fix the cause or document the failure with its reason.
- When you add a user-facing string, add it to **both** locales in `src/i18n/dictionaries.ts`; `npm run check:i18n` will fail otherwise. When you add a product or image, keep `npm run check:catalog` green - it verifies that every declared image variant exists on disk.
- **Keep demo wording out of the shopping presentation.** Redundant explanatory lines, badges and audit notes (photo-source captions, external source URLs, repeated "demo" notes) do not belong in the storefront UI. The safety surfaces stay: the locked announcement strip, the simulated-checkout identification, the inert checkout route and `robots: noindex`. `npm run verify:browser` asserts both - no external links on a product page, and the announcement present on every route.
- Never claim browser, device or accessibility verification you did not perform. The suite covers headless Chromium only; real iOS Safari, Android Chrome and screen readers remain unverified.

## Phase status

Phase 0 (audit and foundation documentation), Phase 1 (foundation + client-ready frontend demo), Phase 2 (imagery, hero, announcement strip, typography) and Phase 3 (single-row featured shelf, curated selections, pricing hierarchy, catalog expansion, mobile-first refinement) are complete. The next phase is an **authorised merchant-backend capability audit and integration plan** - do not begin it automatically.
