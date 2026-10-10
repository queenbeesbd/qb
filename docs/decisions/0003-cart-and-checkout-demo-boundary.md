# ADR 0003 - Cart persistence and simulated-checkout boundary

- Status: accepted (owner-approved, Phase 1)
- Date: 2026-10-11

## Context

The demonstration needs working cart interactions, but no backend is authorised and no payment integration exists. The client is a cosmetics retailer who must be able to show the flow without any risk of a real order being created or a shopper being misled, and `AGENTS.md` forbids storing customer data in the browser.

## Decision

1. **Cart state** is a module-level external store (`src/features/cart/cart-store.ts`) read through `useSyncExternalStore`. Only `{ productId, quantity }` pairs are persisted, under `queenbees.cart.v1`.
2. **All money arithmetic** happens in one place (`CartProvider`), in integer poisha, joined against the local catalog. Components never compute totals.
3. **Persisted data is treated as untrusted input:** it is parsed defensively, filtered against known product ids, de-duplicated, and clamped to `1..20` per line with a 40-line cap. Unparseable storage is discarded silently.
4. **The checkout route is inert.** It renders no form, no input, no submit button and no payment field, and performs no network request. It carries a persistent "preview only" banner and states plainly that no order was created and no payment was taken.
5. **A demo notice is rendered on every route** through the shared shell, and `robots: { index: false, follow: false }` keeps the demo out of search results.

## Rationale

- Rejecting unknown ids at read time means a tampered or stale storage entry cannot inject a product that is not in the catalog.
- Clamping on both write and read means a hand-edited `localStorage` value cannot produce an absurd quantity or total.
- Keeping the checkout route structurally incapable of submitting is stronger than disabling a button: there is no code path to abuse, and no field exists to collect personal or payment data.

## Consequences

- This cart is a **presentation-layer simulation**. It is not authoritative for price, discount, stock or totals, and it must be replaced by server-validated state before any real ordering exists.
- A future real checkout will need a new route and a trusted server boundary; it should not extend this component.
- Adding variants, coupons or delivery charges later must extend the single pricing function rather than adding per-component math.

## Verification

Browser checks confirm: quantity 2 gives subtotal and total 700; changing to 5 recomputes to 1750; typed values 999 and -4 clamp to 20 and 1; the cart survives a refresh; removing the line empties it, clears storage to `[]` and offers a recovery link; corrupt storage and an unsupported locale both fall back safely; and the checkout route has 0 forms, 0 inputs, 0 payment fields, 0 submit buttons and 0 external hosts.
