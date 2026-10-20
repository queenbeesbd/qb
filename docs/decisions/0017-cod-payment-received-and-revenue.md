# ADR 0017 - COD payment received as one action, and what counts as revenue

Status: **accepted 2026-10-20** (owner directive). Corrects a wrong premise in a proposed Phase 21.

## Context

A COD reconciliation phase was proposed around a **courier statement**: record the statement reference,
its period and its settlement figures, match entries to orders, and record discrepancies. That phase
was never built. The owner corrected the premise:

> QueenBee's does not use courier statements and does not need a courier reconciliation system.

The confirmed business workflow is short:

1. The customer places a COD order.
2. The owner approves it.
3. The order is dispatched and delivered.
4. When the owner **receives the payment**, the owner manually marks the order **Payment Received**.
5. That action marks the order **Completed** and adds the product revenue to the dashboard.

Compared against the code, two things were wrong. Payment receipt (`cod_collected`) and completion
(`status = 'completed'`) were **two separate owner actions**, and receipt was offered as early as
`confirmed`. And the dashboard showed **no revenue at all** - the overview deliberately stated that the
application could not substantiate one.

## Decision

### 1. There is no courier statement, and none is modelled

No statement table, no statement reference, no settlement period, no matching, no discrepancy queue
for settlement. `cod_reconciled` stays written by nothing, exactly as it was - it is retained schema,
like the reservation tables (ADR 0013). **Migration `0005`, which had been proposed for statement
tables, is not created.** The schema stays at 42 tables.

### 2. Payment received is one owner action that also completes the order

`markPaymentReceived` (`src/server/orders/fulfilment.ts`) does two guarded updates inside the caller's
transaction:

| Step | Guard (in the WHERE clause) | Written |
| --- | --- | --- |
| record receipt | `cod_state = 'cod_approved'` and `status in ('shipped','delivered')` | `cod_state = 'cod_collected'`, `cod_collected` event, `cod.collected` audit |
| complete | `status in ('shipped','delivered')` and `cod_state = 'cod_collected'` | `status = 'completed'`, `completed_at`, `order_completed` event, `order.completed` audit |

- **Available from `shipped` as well as `delivered`.** Cash usually reaches the owner while the parcel
  is still with the courier; the owner's own confirmation is the money fact, and gating it on a delivery
  status would force the owner to record a delivery that may not have happened.
- **Not available before dispatch.** `confirmed`/`processing` are refused, because there is nothing to
  receive and an early click would complete an order that never shipped.
- **Permission: `cod.confirm_collection`**, re-checked in the service, not only in the route.
- **Both or neither.** The two writes share one transaction, so revenue can never be counted for an
  order whose receipt rolled back.

### 3. It cannot double-count, by construction

There is **no revenue counter anywhere**. Revenue is a read:

```sql
select sum(total_minor), count(*) from "order"
 where status = 'completed' and cod_state = 'cod_collected'
```

- A repeated submission updates zero rows (both guards fail) and answers `conflict`; the order events
  carry unique keys, so even a retry that slipped past a guard could not duplicate a fact.
- An order contributes `order.total_minor`, written at placement and protected by the `order`
  immutability trigger - its amount can never be restated.
- Dispatch and delivery write neither condition, so they can never make an order count.
- A completed order whose parcel came back (`cod_failed`) collected nothing and is not revenue.

The figure is therefore correct on every read rather than correct because a counter was maintained.

### 4. A failed-delivery charge is the owner's cost, never the customer's

When a delivery fails despite the pre-dispatch confirmation calls, **the owner bears the delivery
charge**, and **no failed-delivery fee is added to the customer's order total**. The implementation
follows from that without a ledger: nothing adds, applies or waives a charge on the order, the total
stays exactly as placed, and the owner's cost is not recorded as an order line.

## Consequences

- The owner's daily operation is three clicks after approval: dispatch, payment received, and - if the
  parcel comes back - failed delivery, parcel received, inspect, complete.
- The dashboard's revenue figure now exists, and its own wording states exactly what it counts.
- `completeOrder` additionally accepts `returned`, because parcel receipt already moved a failed order
  there; closing it out is the owner's explicit act and counts no revenue.
- The proposed courier-statement phase is **withdrawn from the roadmap**, and its open questions
  (statement source, period, discrepancy policy) are closed as questions rather than answered by a guess.

## Not authorized by this ADR

Deployment, provisioning, DNS, credentials, any online payment or gateway work, inventory reservation,
courier integration or tracking references, refund automation, or any new price, delivery or
cancellation policy.
