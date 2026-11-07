# ADR 0029 - Conditional delivery, repeat-customer pricing and published payment instructions

**Date:** 2026-11-08
**Status:** Implemented locally, not deployed
**Owner direction:** Lower delivery charges above a minimum purchase, repeat-customer delivery rates,
an automatic repeat-customer discount, and a payment-instructions block on checkout.

## Context

Delivery has exactly one rule today (ADR 0016): an active Dhaka/Chattogram override, otherwise the
configured default, otherwise a refusal. Orders are Cash on Delivery only (ADR 0015); the manual
prepaid flow was removed in Phase 17, and the `payment_claim` / `payment_recipient` tables are unused
design that nothing reads or writes.

The owner asked for three additional pricing rules and for a checkout block that tells customers when
the delivery charge is expected in advance, where to send a bKash payment, and that a full advance
payment earns a surprise gift - **without** rebuilding a payment method, a claim or a verification
queue.

## Decisions

### 1. The three rules live on the existing `delivery_setting` row

Eleven additive columns, no new table (migration `0017`). Every rule has its own switch defaulting to
**off** and every amount is nullable, so an upgraded database behaves exactly as it did before: the
default charges, no conditional rate, no repeat benefit. `npm run db:migrate` is the only step.

### 2. One pure resolver defines the hierarchy

`src/lib/delivery.ts` gains `quoteOrderDelivery(rates, area, context)`, used by the cart, the checkout
preview and the order transaction. For a signed-in customer:

1. repeat delivery - repeat customer, rule on, rate for the area;
2. conditional delivery - rule on, `subtotal >= minimum`, rate for the area;
3. active district override (existing);
4. configured default (existing);
5. refusal.

A **guest** is `authenticated: false`, so it can only reach steps 3-5 whatever its subtotal. A rule
that is switched on but has no rate for an area **falls through** rather than charging a guessed
number.

### 3. "Repeat customer" is one completed order, read server-side

`status = 'completed'` is the definition, because that state is reachable only through the owner
recording the cash (ADR 0017). A pending, cancelled, rejected or unpaid order therefore cannot confer
the benefit, and a guest (`customer_id IS NULL`) never qualifies. The fact is read inside the order
transaction; the browser is told the answer so it can preview, never asked for it.

### 4. The repeat rate has two fields, not three

The owner configured Chattogram and "rest of Bangladesh". **Chattogram keeps its own rate; Dhaka and
every other district use the "rest" field**, labelled "Dhaka and all other districts" in the admin
screen. That is the only mapping the three-area model can express without inventing a fourth price.

### 5. The repeat discount is automatic, integer, and never double-counted

`floor(subtotal × percent / 100)`, applied only above the configured minimum. It is added to any
promotion code's discount and the pair is capped at the goods subtotal, so no combination discounts
the same taka twice or makes delivery free. The combined amount is snapshotted in
`order.discount_minor`, the resolved charge in `order.shipping_minor`, and `order.total_minor` is still
checked by the database as `subtotal - discount + shipping`. A promo redemption row records the code's
own share, bounded by what was applied.

### 6. Payment instructions are owner copy, not a payment method

The checkout prints four owner-controlled values from `store_setting` - the paragraphs, the bKash
number, the "Payment, not Send Money" caution, and the subtotal below which the delivery charge is
expected in advance (default 500 BDT) - edited at **Settings -> Contact and policies** and audited as
`settings.payment_instructions_updated`. The defaults are the owner's supplied Bangla copy, kept in
`src/data/payment-instructions.ts` and rendered as plain paragraphs (a `<` or `>` is refused), with the
number as a bold element and a copy button.

**Cash on Delivery remains the only method an order records.** Nothing in this change writes a payment
method, a payment state, a claim or a verification, and the owner still confirms a transfer on the
phone. The checkout states the advance expectation and the gift as published terms; the order itself is
unchanged. Rebuilding a prepaid flow is a separate owner decision that would supersede ADR 0015.

## Consequences

- Settings -> Delivery charges gains three sections (conditional, repeat delivery, repeat discount),
  each with its own save and audit action (`delivery.conditional_updated`,
  `delivery.repeat_delivery_updated`, `delivery.repeat_discount_updated`). Switching a rule on requires
  its values, so a half-configured rule cannot silently do nothing.
- The cart and checkout price breakdown name the automatic discount and, below the threshold, the
  advance delivery amount. Nothing is shown to a guest that a guest cannot receive.
- The bKash instruction block is data, so the number and the wording change without a deploy. The
  English-only interface rule still holds; owner copy is data, exactly like a product's Bengali name,
  and `scripts/check-i18n.ts` lists the defaults file as data.
- Deliberately not built: a payment method selection, a claim, a screenshot upload, a verification
  queue, a courier or gateway integration, scheduled campaigns, per-product pricing rules, or any
  benefit that a guest can reach.
