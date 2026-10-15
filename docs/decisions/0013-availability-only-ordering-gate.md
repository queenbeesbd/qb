# ADR 0013 - Availability is the only ordering gate (D19 scope)

- Status: accepted (owner-decided, 2026-10-15)
- Extends: ADR 0009 (D19 availability), ADR 0010 (availability as a bare owner toggle),
  ADR 0011 (local catalog authority and the storefront cutover).
- Closes: the open question in **ADR 0009 section 1**, left open again in **ADR 0010**, and recorded in
  the **D19** row of the register in `docs/platform-architecture.md`.
- Related: `docs/data-model.md` sections 8, 12 and 15, `docs/payment-workflow.md` 13.10,
  `docs/implementation-plan.md` (Phase 15).

## Context

D19 is approved: product availability is an **owner-controlled `In Stock` / `Out of Stock` state**, and
an out-of-stock product **cannot be ordered**. ADR 0009 section 1 deliberately left unresolved how that
state relates to the quantity model already approved in D11 - an `inventory_balance` row with
`CHECK (reserved <= on_hand)`, an append-only `inventory_movement` ledger and `stock_reservation` - and
offered two options without choosing one. ADR 0010 then scoped availability to a bare toggle for
Phase 13 and left the Phase 15 question open, recording that Phase 13 writes no inventory movement,
deduction or reservation and therefore does not prevent overselling.

The owner has now decided the Phase 15 question, which is what this ADR records.

## Decision

**Availability is binary, owner-controlled, and the only ordering gate. Order creation writes no
reservation, allocation, deduction or automatic availability change.**

1. **The gate is `product.availability`.** `in_stock` allows ordering; `out_of_stock` rejects it. The
   authoritative server-side check reads this state (together with publication and archive status) from
   the database. A client never supplies it.
2. **No stock quantities, reservations, allocation, deductions or automatic availability changes** are
   implemented in the order path. Order creation writes **no** `inventory_balance` update, **no**
   `inventory_movement` row and **no** `stock_reservation`. Availability never changes automatically -
   only the owner changes it.
3. **Idempotency prevents duplicate processing of the same submission; it does not introduce inventory
   reservation behaviour.** A repeated submission returns the original order; it does not reserve,
   allocate or hold a unit.
4. **Separate valid submissions may create separate orders for an `in_stock` product.** Two customers
   may each place a valid order for the same product, and the software does not arbitrate the last
   physical unit. This is option **(a)** from ADR 0009 section 1, decided in writing.
5. **Overselling is not prevented and is accepted.** The structural backstop designed in D11
   (`CHECK (reserved <= on_hand)`) stays **inert** while nothing writes a reservation. The risk is
   recorded here and in `docs/data-model.md`, not hidden.

**The inventory tables are not removed.** `inventory_balance`, `inventory_movement` and
`stock_reservation` remain implemented (Phase 11) and **unused**. Removing or reducing them is a
migration and a separate decision, and is **not** authorized here. The schema stays at **40 tables** and
this decision changes no migration.

**What this changes about D11.** D11's stock reservation, allocation and release machinery is **not used
by order creation**. The D11 tables remain. D11's payment-claim rules - "the first submitted payment
claim gets the product" and "at most one active submitted claim per unit" - remain **approved for the
payment-claim flow (Phase 16)**; their *stock-ordering* effect has no launch implementation, because no
unit is reserved. Reconciling D11's per-unit claim bound with a model that holds no units is recorded as
an open question for Phase 16 rather than answered here.

## Consequences

- **The Phase 15 acceptance criterion "concurrent checkout of the last unit cannot oversell" is
  superseded.** It is not achievable under a binary availability gate and is not required by this
  decision. The idempotency criterion stands unchanged: a repeated submission returns the original order
  and creates no duplicate.
- **The oversell risk becomes an operational responsibility.** If the store can sell more units than it
  holds, the owner manages that by keeping availability accurate and restocking; the software will not
  adjudicate the contested unit.
- **No schema change and no migration.** The unused inventory tables stay exactly as Phase 11 left them.
- **D19 is fully closed.** No availability-versus-quantity question remains open, so Phase 15 has no
  outstanding inventory decision to make before writing an order.
- **The storefront is unaffected.** It already reads the owner-controlled availability state through
  the catalog accessor (ADR 0011); nothing in the read path changes.

## Alternatives considered

- **The toggle sits over the quantity ledger, which becomes the allocation backstop (option (b)).**
  Rejected by the owner: it requires implementing the D11 reservation path in the order transaction, and
  the store is operated with binary availability. The D11 design remains available if the owner later
  reverses this.
- **Drop the unused inventory tables now.** Rejected: it is a migration, it is not needed to implement
  the decision, and it is not authorized by this ADR.

## Open questions

- **Whether to retire the unused `inventory_balance`, `inventory_movement` and `stock_reservation`
  tables** in a later migration. Not decided and not authorized.
- **How D11's "at most one active submitted claim per unit" applies when no unit is reserved.** A
  Phase 16 design question, recorded rather than invented.

## What this does not authorize

No schema change, migration, table removal, order creation, deduction, reservation, delivery policy,
provisioning, deployment, DNS or credential change. **Nothing is implemented by this ADR.**
