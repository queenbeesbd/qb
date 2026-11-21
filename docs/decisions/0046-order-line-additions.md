# ADR 0046 - A customer may add a product to an existing order by phone

Status: accepted (owner direction, 2026-11-21). Amends the **order immutability** rule in
`docs/data-model.md` and the "order line is frozen" statement in ADR 0009: one narrow, audited path may
append a line to an order and raise its charged total before dispatch. Everything else in those
decisions stands - in particular the COD-only release, the five separate state concepts, the ban rule,
and ADR 0013's "no stock movement, no reservation, overselling accepted".

## Context

The owner sells one store's own goods to its own customers. A customer places an order, then calls and
says "I need this one too - please change my order." That is a normal shop-floor event, not a
marketplace feature. Before this decision the application treated every placed order as a sealed
snapshot: `order_item` has a `BEFORE UPDATE OR DELETE` trigger, and the `order_immutable_columns`
trigger froze `items_subtotal_minor` and `total_minor` alongside the order's identity. The owner could
only refuse the customer or start a second order, which makes the courier collect two parcels and the
shop explain two receipts.

The reference order screen the owner supplied has an "Add More Product" control. It is the right task
model: the owner recognises the product by its photograph, adds a line, and the shop's figures move with
it. The earlier implementation could not offer it honestly because no write path existed.

## Decision

1. **Before dispatch only.** A line may be appended while the order is `pending`, `confirmed` or
   `processing`. A dispatched, delivered, completed, failed, returned or cancelled order is refused:
   once a parcel is with the courier, the customer's change is a new order or a support decision.
2. **One append, never an edit.** The existing lines are still frozen by the `order_item_immutable`
   trigger. The new line is an INSERT with its own frozen snapshots of the product name, pack label,
   SKU, unit price and primary image key - exactly the fields placement records. Nothing edits or
   deletes an old line.
3. **The server prices it.** The owner picks a live, published, in-stock product and a quantity; the
   service reads the active variant's `price_minor` inside the transaction. No price, discount, total or
   product record is trusted from the browser. Availability remains the only ordering gate (ADR 0013):
   an out-of-stock product cannot be added, availability is not changed, and no stock movement or
   reservation is written.
4. **Only the two money columns may move, and only together.** The transaction-scoped setting
   `qb.order_amendment = on` is the sole condition under which `queenbees_guard_order_immutable_columns`
   permits `items_subtotal_minor` and `total_minor` to change. It also requires the two deltas to be
   equal and positive (`discount_minor` and `shipping_minor` stay as they were), so a handler that sets
   the flag cannot silently rewrite an unrelated amount. Order number, customer, currency, payment
   method and placement time stay frozen unconditionally.
5. **An owner-only permission.** `order.amend` is privileged: only an owner-level role can hold it, the
   database guard refuses it on a moderator role, and the service re-checks it even when the route has
   already passed. Moderators can run the shop floor; changing what a customer will be asked to pay is
   an owner decision.
6. **The record is explicit.** The append writes an `order_event` (`order_line_added`) with the actor,
   reason and event key, and an audit row (`order.line_added`) with the amount and the totals before
   and after. The new line is visible in the order's products list with the same photograph the owner
   saw in the picker, and the invoice's Amount due, Grand total and "Amount to collect" all reflect the
   new total because the receipt and courier booking read the order row.
7. **No silent retry.** The form carries an idempotency token; the event key is unique, so a double
   submit records one addition and returns the order rather than charging twice.

## Consequences

- A delivery charge is **not** re-quoted: the shop may choose to collect the new line's delivery cost on
  the phone, but the platform never invents a new fee. The stored shipping snapshot is unchanged.
- A promotion code's discount is also unchanged. Adding a line does not recompute or re-validate the
  code; the customer's original saving stays as charged.
- If cash was collected, the order is already completed, so the path is closed. There is no partial
  refund, no negative delta and no post-collection adjustment.
- The order's `total_minor` is no longer immutable *for every writer*. It is immutable for every
  writer except this one service, and the database enforces both the flag and the equal-delta rule.
  This is a deliberate exception, not a general permission to edit orders.
- The receipt page reads the order row on each request, so a customer who already has the receipt link
  sees the added line on their next load. The owner is responsible for the phone call that agrees the
  change.
