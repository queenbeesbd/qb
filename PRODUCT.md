# QueenBee's - product truth

QueenBee's is a **single-store, owner-operated cosmetics shop** in Bangladesh. The owner sells this
store's own goods to this store's own customers. It is not a marketplace, a multi-vendor platform, a
store builder, or a hosted service for other businesses (ADR 0008).

## Who the admin is for

The **owner**. One person, on a phone, in and around the shop, often between customers. There are no
staff or support roles at launch, no role picker and no permission matrix (D10, ADR 0009). Multiple
owner accounts may exist and every owner has full access.

A typical session, on a phone:

1. Open the admin and see what is waiting.
2. Call a cash-on-delivery customer, then approve or reject the order.
3. Mark an order dispatched, delivered, or payment received.
4. Check or change a product's In Stock / Out of Stock state.
5. Look up a customer, or read the audit trail after something odd.

## Product truths the interface must not break

- **Cash on Delivery is the only payment method** (ADR 0015). There is no online gateway and no
  verification queue. Payment received is one owner action, and it also completes the order.
- **Availability is the only ordering gate** (D19, ADR 0013): `In Stock` / `Out of Stock`. No
  reservation, no deduction, no expiry, and overselling is accepted and managed operationally.
- **A refund is settled outside the platform** and is out of scope. No screen may imply one happened.
- **A customer ban** requires a confirmed fake order, is owner-set, always carries an audited reason,
  and never cancels or refunds an order.
- **Every refusal is recorded**, and the record is never written inside the refused transaction.
- **Money is integer poisha.** Never floating point, never a total or discount from the browser.
- **No invented data**: no fake stock, reviews, ratings, sales counts, arrival dates, delivery
  promises, discounts or testimonials. When a fact does not exist, the interface states the gap.
- **The storefront is a demonstration.** The locked demo notice is a safety surface that stops the
  store being mistaken for a live ordering channel. It is enforced by `check:catalog` and
  `verify:browser` and is not removed by a visual redesign.
- The interface is **English only**; product and category records still carry their Bengali names.

## Success for the admin

- The owner can see what needs attention and decide a COD order **within seconds of opening the app**,
  on a phone, without hunting through navigation.
- Nothing destructive is one accidental tap away; every refusal explains itself.
- Every figure on the screen can be reconciled against the rows it was derived from.
- The admin feels like the same shop as the storefront: warm, precise, plum and lavender, never a
  generic dark SaaS console.

## Non-goals

Marketplace or multi-tenant features, staff roles, online payments, refunds, courier integration,
third-party analytics, engagement mechanics, or decorative data.
