# ADR 0034 - Per-product delivery charges

**Status:** accepted, 2026-11-10. **Owner decision.** Amends the delivery pricing hierarchy in
[ADR 0029](0029-conditional-and-repeat-customer-pricing.md).

## Context

Delivery was charged by area for the whole store: `delivery_setting` holds one default and two optional
district overrides, and every order is priced from the customer's chosen delivery area. The product
editor said exactly that under a **Shipping** heading and pointed the owner at Settings -> Delivery
charges.

The owner asked for the opposite on 2026-11-10: *"products can have its own delivery charges ... remove
the shipping component and add delivery charge component where there will be three form for ctg then
dhaka and then others ... adding this will be optional and if we dont add they will use normal site
delivery fee."* The stated resolution when a basket mixes products was explicit: a custom fee wins over
the site fee, and several custom fees resolve to **the lowest**.

## Decision

1. **Three optional columns on `product`**, in poisha: `delivery_chattogram_minor`,
   `delivery_dhaka_minor`, `delivery_others_minor`. `NULL` is the ordinary case and means "the store's
   configured charge applies". `0` is accepted and means **free delivery** for that area; blank and zero
   are deliberately different statements. A negative value is refused by a `CHECK`.
   Three columns, not a rate table: one store's own goods, three fields, one row per product.
2. **The fee is per order, not per unit.** Quantity does not multiply it, and it never enters the goods
   subtotal, a promotion or the automatic discount. It is written into `order.shipping_minor` (and
   therefore `order.total_minor`) exactly like any other resolved charge, and the order's existing
   immutability keeps it as the snapshot the customer was charged.
3. **The basket's charge is the lowest applicable fee.** `customDeliveryMinor` reads each line's fee for
   the customer's area, ignores lines with none, and takes the minimum. One product with a fee and
   others without uses the fee; several with fees use the lowest. Lowest rather than highest because the
   shopper chose the basket and should not be charged the largest of several stated prices.
4. **The product fee outranks the whole store hierarchy.** In `quoteOrderDelivery` it is answered first,
   before the repeat rate, the conditional rate, the district override and the default. It is the
   shop's stated price for delivering that product, not a customer benefit, so:
   - it applies to a **guest** as well as a signed-in customer;
   - the repeat-delivery rate and the conditional-delivery rate do not re-price it;
   - it can price an order when **no default charge is configured** - the configured default is only
     needed for products that state no fee of their own.
5. **The same resolver prices the preview and the order.** The cart projection carries each product's
   three fees, so the checkout preview calls `customDeliveryMinor` and `quoteOrderDelivery` with the same
   inputs the order transaction reads inside its own transaction. The server recomputes everything; no
   amount is accepted from the browser.
6. **The editor names it.** The product form's Shipping card becomes **Delivery charge**: three optional
   BDT fields (Chattogram, Dhaka, Other districts), one hint stating that a blank field uses the store's
   charge and that the lowest fee wins, and the link to Delivery charges. Values are parsed with
   `parsePoisha` (a typed string, never a bare number) and audited with the product write as
   `deliveryMinor` in the before/after record.

## Consequences

- **Migration `0021`** adds the three columns and their non-negative checks. Additive, no table added or
  dropped; table count stays **52**.
- **The checkout summary states which rule priced the order.** A `source: 'product'` quote shows "A
  product in this order carries its own delivery charge for this area."
- **A promotion code and the automatic repeat discount are unchanged**: they reduce the goods subtotal
  only, and the delivery charge is added after them, so no discount can pay the courier.
- **Not built:** per-quantity delivery, per-category fees, a product fee that stacks with the store's
  charge, free-delivery thresholds, or any automatic recalculation of an existing order. A change to a
  product's fee affects later orders only; stored orders keep their snapshot.

## Alternatives considered

- **A `product_delivery_rate` table.** Rejected: it would hold at most three rows per product and no
  other column, for a single-store product whose owner asked for three fields.
- **Adding the product fee on top of the store's charge.** Rejected by the owner's rule ("then we use
  the custom one").
- **Highest fee when several products state one.** Rejected: it would surprise a larger basket with a
  bigger charge than the same products ordered separately.
- **Applying the repeat/conditional rate to the product fee.** Rejected: both are *rates* for an area,
  not a discount on a charge, and re-pricing a stated product charge would make the shop's own price
  depend on account history.
