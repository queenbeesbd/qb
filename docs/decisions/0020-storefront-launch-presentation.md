# ADR 0020 - The storefront leaves demonstration: no demo notice, a phone tab bar, and six-product sections

Status: **accepted 2026-10-23** (owner directive). Supersedes the demo-notice requirement in AGENTS.md,
`docs/catalog.md` and the announcement assertions in `check:catalog` / `verify:browser`.

## Context

The storefront has carried a locked, non-removable notice since Phase 1:

> This is a preview store — orders are recorded here, but no payments are taken and nothing is
> dispatched.

That notice existed because the store could not take a payment or dispatch a parcel. It was enforced in
three places at once: the entry itself in `src/data/announcements.ts`, a `check:catalog` assertion that
the entry exists and is locked, and a `verify:browser` assertion that its copy renders on every route.

The owner has now asked for it to be removed **completely**, together with the footer's demonstration
sentence, and for the storefront to be presented as the shop it is. Alongside that, four interface
decisions were requested in the same brief:

1. the storefront needed a full visual upgrade, with a navigation bar whose options are genuinely centred;
2. the phone needed the same bottom-bar navigation the admin shell now uses;
3. sign-in, registration and the account page needed a redesign;
4. the homepage showed too few products per section, and an odd count left gaps on a phone.

## Decision

### 1. The demo notice is removed, and the checks are inverted

`src/data/announcements.ts` is now an **empty typed list**. `activeAnnouncements()` still exists because
the storefront layout composes the strip from it, and a future owner-authored notice that must never be
switched off would be declared there with `locked: true` - nothing is locked today.

The announcement strip now renders **only the owner's own line** from `store_setting`, and renders
nothing at all when that line is empty or switched off. The "Demo"/"Info" badge is gone: it labelled the
locked notice, and a badge reading "Info" beside the shop's own news is furniture.

The two assertions were **inverted rather than deleted**, so the removal is enforced in both directions:

- `check:catalog` fails if any configured announcement is `locked`, or if any announcement's text still
  matches `demo|preview|demonstration`;
- `verify:browser` fails if any route's visible text still matches
  `preview store|demonstration storefront|no payments are taken|nothing is dispatched`, or if an empty
  strip is rendered in place of the one that used to be there.

**What is deliberately unchanged:** the interface still never claims a capability the product does not
have. Checkout remains cash-on-delivery only, delivery charges are still the owner's configured amounts,
and no delivery promise, payment promise or dispatch time is published anywhere. Removing the notice
removes a statement about the *store's status*, not the honesty rules about its *claims*.

### 2. One navigation model per size

Below 1024px the header's drawer is **removed**, not hidden. A fixed bottom tab bar
(`src/components/StorefrontTabBar.tsx`) carries five destinations - Home, Shop, Categories, Cart, Account
- with 64px targets, the cart count on its tab, `aria-current` on the current section, and
`env(safe-area-inset-bottom)` reserved. The shell reserves the bar's height so it never covers the footer.

From 1024px the header carries the category navigation and the bar is not rendered. A hamburger and a
bottom bar are two models for one screen; the owner asked for the bar, so the drawer was deleted.

**`/categories` is a new route.** The drawer was the phone's only full category list; with it gone, the
bar's Categories tab needed somewhere to land. The index lists every category with its product count,
derived from the same catalog snapshot the cards link into.

### 3. The desktop header keeps the navigation beside the brand, centred vertically

The links sit **immediately after the logo** and the search field and account controls take the remaining
space at the far end. "Centred" in the owner's brief meant centred **up and down** on the bar, not floated
to the middle of the viewport: each link is a 40px control centred on the row's axis, so the bar reads as
one line rather than as text sitting on a baseline. A viewport-centred variant was built first and
corrected on the owner's clarification.

Between 1024px and 1199px the search field becomes a compact link to the catalog's own search rather than
a field squeezed to an unusable width; the real 240px field returns at 1200px.

### 4. Homepage sections publish six products, and six is derived

`RECENT_LIMIT` is 6. The full-width grid is **two columns on a phone and three from 880px**, so six
completes every row at both widths - two rows of three on desktop, three rows of two on a phone. The
offer row is three, one complete row. `ProductGrid` measures its own child count and lets a lone last
card span the row on a phone, so owner data with an odd count never leaves a gap.

Selections still never repeat a product. Recency cannot be filtered (it is a fact about the catalog), so
the curated shelf and the offer row yield to it.

### 5. The account surfaces are two-panel pages

Sign in, registration and the one-time-code page share `AuthShell`: a lavender intro panel and a white
form panel, stacked on a phone with the intro reduced to the brand and one sentence. The account page
became a hub - orders, details, password route, session - and its signed-out state uses the same frame
rather than a lone card on an empty page.

## Consequences

- **The honesty requirement is narrower, not weaker.** The locked notice is gone by owner decision; every
  other honesty rule stands, and the inverted checks make reintroducing a demo notice a failing test.
- `AGENTS.md`, `docs/catalog.md` and `docs/design-system.md` were updated in the same change: an
  instruction that says the notice "must not be removed" would otherwise contradict the code.
- The phone has **one** navigation surface, which is what makes the bottom bar learnable.
- A future owner-authored locked notice is still possible through the same list, but it now needs an ADR
  because `check:catalog` refuses any locked entry.
