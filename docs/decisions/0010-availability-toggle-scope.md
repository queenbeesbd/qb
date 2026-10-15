# ADR 0010 - Availability is a bare owner toggle, and Phase 13's catalog scope

Status: 2026-10-12. Owner-approved. Extends ADR 0008 (single-store product model) and ADR 0009
(D19 availability, D20 bans, D21 owner-only accounts). **Closes the open question in ADR 0009 section 1.**

## Context

ADR 0009 recorded D19 - availability is a simple owner-controlled **In Stock / Out of Stock** state,
and an out-of-stock product cannot be ordered - and then recorded, deliberately unresolved, how that
state relates to the quantity model already approved in D11: an `inventory_balance` row with
`CHECK (reserved <= on_hand)`, an append-only `inventory_movement` ledger and `stock_reservation`. It
offered two options and chose neither, because the choice changes what the database guarantees.

Phase 13 is where availability is first **edited**, so the question had to be answered before the
toggle could be built.

## Decision

**Availability is a bare owner toggle. It is not connected to the quantity model in this phase.**

1. `product.availability` is a text column with exactly two permitted values, `in_stock` and
   `out_of_stock`, enforced by `CHECK (availability in ('in_stock', 'out_of_stock'))` (migration `0003`).
2. **It defaults to `out_of_stock`.** The fail-safe direction is that a product nobody has confirmed as
   available cannot be ordered, so a new row is never silently orderable. `is_published` already
   defaults to `false` for the same reason.
3. **The state is the orderability gate.** `checkOrderability` (`src/server/catalog/orderability.ts`)
   reads the database and refuses an unpublished, archived or out-of-stock product. Nothing the browser
   submits participates in that decision.
4. **No quantity participates.** Phase 13 writes no `inventory_balance` row, no `inventory_movement` and
   no `stock_reservation`. The ledger, the balance and the reservation tables remain implemented and
   **unused**, exactly as Phase 11 left them.
5. **The inventory schema is not removed or rewritten.** D11's design is intact and still the approved
   model for reservations; it is simply not exercised by this phase.

## Consequences

**What this buys.** The owner gets the control the business asked for, in one column, with one audit
action and one server-side check. There is no partial quantity implementation to reason about, and no
half-connected ledger that would make a later decision harder.

**Acknowledged risk - this phase does not prevent overselling.** Availability is a **state**, not a
quantity. Once ordering exists (Phase 15), two concurrent orders for the last physical unit would both
pass `checkOrderability`, because nothing counts units. **This is not a defect introduced here; it is
the direct consequence of choosing the toggle, and it is stated rather than hidden.** The database's
`CHECK (reserved <= on_hand)` backstop is inert while nothing writes a reservation.

**What Phase 15 must therefore settle, before it writes an order.** The question is not whether the
toggle works - it does - but what happens when the last unit is contested. The options remain the two
ADR 0009 section 1 named:

- **(a) The toggle is the only gate.** Simplest, and honest only if the store never sells more units
  than it holds; it needs an operational answer for the contested case, because the software will not
  provide one.
- **(b) The toggle sits over the quantity ledger**, which becomes the allocation backstop: a reservation
  is taken in the order transaction, `available` is derived as `on_hand - reserved`, and the toggle can
  only make a product *unavailable*, never available-but-unsellable.

Choosing (b) means implementing the D11 reservation path in Phase 15, which the design already
specifies. Choosing (a) means the D11 tables stay unused and the oversell risk above is accepted in
writing.

**Other consequences.**

- **No inventory adjustment surface exists**, so `inventory.adjust` remains catalogued but unreachable -
  a name, not an ability. `PERMISSIONS_IMPLEMENTED` in `src/server/authz/permissions.ts` records that.
- **The Phase 1 fixture keeps `availability: 'in_stock' | 'out_of_stock' | 'unknown'`.** `unknown` is a
  snapshot artefact of a captured listing and is not a state the owner can set, so the database enum has
  two values and the fixture type is left alone. The storefront still renders the fixture in Phase 13.
- **The storefront is not cut over in Phase 13.** `src/data/catalog.ts` and its synchronous accessors are
  unchanged; the database catalog is reachable through `src/server/catalog/read.ts` and the authenticated
  read API only. The cutover belongs to Phase 14. **Amended by ADR 0011:** the cutover was performed
  server-side, and it did **not** include a public catalog read endpoint - the "public read endpoint"
  named here was an expectation, not an approved requirement.

## What this does not authorize

No provisioning, deployment, DNS change, credential, object storage, image upload, email or OAuth
provider, and no customer-facing surface. No change to the D11 reservation design, and no deletion of the
inventory tables.
