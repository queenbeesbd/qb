# ADR 0018 - Payment receipt with per-order additional courier costs

Status: **accepted 2026-10-20** (owner directive). Extends ADR 0017. Approved with an explicit
migration authorisation for `0005_order_additional_cost`.

## Context

ADR 0017 established that the owner confirms payment manually and that one action records the receipt
and completes the order. The owner then supplied the missing half of the money picture:

- the customer pays the product price **plus the delivery fee**;
- that delivery fee is the courier's **standard** charge, which the courier keeps;
- the courier may impose an **unexpected charge on one particular order**;
- the owner verifies payment in the **courier's own dashboard**, outside QueenBee's;
- and at the moment of confirming payment the owner may need to record that extra charge.

Before this ADR the platform had no way to record a cost the shop incurred. The dashboard's figure was
the customer's gross payment, labelled revenue - which is neither what the shop receives nor a
differentiable net amount.

## Decision

### 1. `order_additional_cost` is a separate table, never a column on `order`

```
order_additional_cost
  id, order_id -> order(id) ON DELETE RESTRICT,
  amount_minor integer CHECK > 0 and <= 100000000,
  description text CHECK btrim length 3..200,
  recorded_by_staff_id, recorded_at,
  voided_at, voided_by_staff_id, void_reason
  CHECK void columns are all-null or all-set with a reason >= 3 chars
```

**Why a table.** The customer's charged amounts are frozen by `order_immutable_columns`; a cost the
*shop* pays must be structurally unable to reach the invoice. A row also gives each cost its own
identity, actor and timestamp, which a column cannot.

**Why no `category` column.** The owner's description is the classification. A fixed category list
would encode a cost policy nobody approved.

**Never deleted, never overwritten.** Two triggers hold it, independent of role:
`order_additional_cost_immutable_columns` refuses any change to the order, amount, description or
recording actor, and refuses un-voiding; `order_additional_cost_no_delete` refuses `DELETE`. A mistake
is corrected by **voiding** with a required reason, so the history stays readable while the active
total stops counting the row.

**Migration `0005` is additive only:** one new table, three foreign keys, two indexes, four checks, two
triggers and one guard function. No existing column, row, constraint, grant or trigger changed.
**Schema 42 → 43 tables.**

### 2. Costs are recorded *with* the receipt, in the same transaction

`markPaymentReceived` accepts `costs[]` and writes them **after** the receipt and the completion, in
the caller's one transaction. Consequences, all tested:

- A malformed amount or description refuses the **whole action** - the order is not completed and no
  cost is saved, because the transaction rolls back as a unit.
- A refused receipt (wrong state, duplicate, concurrent loser) also saves no cost.
- Zero costs is the ordinary case and needs no special handling: the form posts repeated
  `costAmount`/`costDescription` pairs and blank pairs are skipped.

`order.cost_record` is a new **privileged** permission: recording a cost writes a money fact but is not
implied by `cod.confirm_collection`, so a principal may confirm payment without being able to record a
cost. Both are re-checked in the service. Audit actions: `order.cost_recorded`, `order.cost_voided`.

### 3. Four amounts, kept conceptually separate

| Figure | Meaning |
| --- | --- |
| **Customer payment** | `items_subtotal + shipping` - what the customer paid. **Gross. Never called revenue.** |
| **Standard delivery fee** | `order.shipping_minor` - the configured charge inside the customer payment, which the courier keeps |
| **Additional courier costs** | The sum of cost rows that are **not voided** |
| **Estimated net proceeds** | `customerPayment - standardDeliveryFee - additionalCosts` |

**The fee is subtracted exactly once.** It is already inside `shipping_minor`, so netting it against the
customer payment is not a second deduction of the same money. Additional costs are separate expenses
that were never part of the customer's payment, and are subtracted after it.

**Everything is derived on read.** There is no counter: each figure is a `sum()` over order and cost
rows that qualify, so an order counts once because it is one row and a cost counts once because it is
one row. Voided costs leave the sum by their `voided_at` and nothing else moves.

**The standard-fee equivalence is checked, not assumed.** `order.shipping_minor` equals the configured
standard fee for every order placed under the three-area model (ADR 0016), because checkout copies the
configured amount into the order. It does **not** for an order that predates that model, which carries
`0` and no `district_code`. Those orders:

- still contribute their **gross** customer payment, because the customer did pay;
- are counted in `unsubstantiatedOrderCount`, and the dashboard states how many there are;
- contribute **nothing** to estimated net proceeds, and when no counted order can substantiate the
  split, the figure reads **Unavailable** rather than a number built on an assumption.

**Net is an estimate, and is labelled as one.** The platform knows the standard fee and what the owner
recorded - not what the courier actually settled.

### 4. Payment receipt stays an explicit, post-delivery owner act

Unchanged from ADR 0017: dispatch and delivery never record payment or complete an order, and nothing
here reads or infers anything from a courier. Receipt is refused before dispatch and refused twice.

## Consequences

- The owner's completion step can record the cost at the moment it is known, with no second screen and
  no risk of an order completed without its receipt.
- The dashboard answers "what did customers pay, what did the courier keep, what did I spend extra,
  and what did I probably net" as four separate figures.
- A cost is auditable forever, including after it is voided.

## Not authorized by this ADR

Courier integration, consignment references, tracking, statement import or automated reconciliation;
refunds; inventory or reservation behaviour; any new delivery-charge, failed-delivery or cost-allocation
policy; deployment, provisioning, DNS, credentials, or any remote database mutation.
