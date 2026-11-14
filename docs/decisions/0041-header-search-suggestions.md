# ADR 0041 - A narrow search-suggestions route for the storefront header

Status: accepted (owner direction, 2026-11-14). Narrows ADR 0011's "no public catalog endpoint" line for
**one** read surface; every other rule in that ADR stands, including that there is no client-side product
index and no search library.

## Context

ADR 0011 settled the storefront on server-side catalog reads only, with the header field committing to
`/products?q=` after a 400ms pause. The owner asked for the reference's behaviour instead: typing a brand
or a product opens a short list of matching products - photograph, name, price with a genuine saving
struck through - and the listing is entered deliberately.

A type-ahead needs matches before a navigation happens, so either the browser asks a route or the shop
ships the catalog into every page. The second is the 81 KB-per-route payload the cart cookie work removed
(2026-10-29) and was rejected.

The real constraint is not privacy - every row is a product the shop already draws publicly - it is
**Neon egress**: the Free plan allows 5 GB of transfer per month, and the catalog snapshot is the shop's
largest transfer. A route that queried the database per keystroke would spend the budget in hours.

## Decision

1. **One route: `GET /api/search?q=`.** It answers at most **six** rows: `id`, `slug`, name, brand, pack,
   price, a comparison price **only** when the saving is genuine, the availability state and the first
   photograph. No facet counts, no paging, no total, no description, no review, no sold count, no expiry
   date - the row draws what the popup shows and nothing else.
2. **It reads the cached snapshot.** `getStorefrontCatalog()` is the same `unstable_cache` read every
   storefront page uses (tag `storefront-catalog`, invalidated after every catalog write, one-hour TTL as
   a backstop), so a keystroke adds **no** database read of its own. This is the property that makes the
   route affordable, and it is why the route may exist at all.
3. **It shares the listing's matcher.** `searchScore` and `displayName` from
   `src/features/catalog/query.ts` are exported and used by `selectSuggestions`
   (`src/features/catalog/suggestions.ts`), so a suggestion can never name a product the listing it opens
   would not contain. The field set stays ADR 0011's scope: name in both locales, brand and pack.
4. **Ranking: relevance, then in stock before out of stock, then name and id.** A dead end never outranks
   a product that can be bought at equal relevance, and the same term always yields the same six rows.
5. **A comparison price is struck through only when `discountAmount` says the saving is real** - the same
   arithmetic a card's saving badge uses.
6. **The field no longer navigates while typing** (owner decision). It opens the list instead; Enter, the
   magnifier and a "See all results for “term”" row at the foot of the list are the ways into
   `/products?q=`. The form stays a plain `GET`, so a browser without JavaScript and the magnifier behave
   exactly as before.
7. **Bounded and silent on failure.** Below two letters the route answers `{ results: [] }` without
   reading the catalog. A catalog read that fails answers the same way, so the field stays usable and
   Enter still searches; responses carry `cache-control: no-store`.

## Consequences

- The storefront now has one unauthenticated read endpoint. It exposes only published catalog rows the
  shop already renders publicly, and it is the **only** such surface: do not add a listing, category,
  brand or facet endpoint beside it without a new decision.
- Traffic that hits the route is answered from Vercel's Data Cache, not from Neon. A flood costs function
  invocations, not the egress budget; there is no per-visitor identity, throttle or cookie.
- The popup and the listing cannot drift about what matches, because there is one matcher, one field set
  and one scoring function.
- `AGENTS.md`'s "do not add a search endpoint or a client-side product index" rule now reads: the
  suggestions route is the one authorized endpoint; a client-side index remains out.
- The reference's "Exp" and "Sold" columns are **not** reproduced: the catalog stores no expiry date, and
  a per-product sold count is a sales claim this popup does not make.
