# ADR 0016 - Three delivery areas, a required default charge and immutable order snapshots

Status: **accepted 2026-10-20** (owner directive). Implements the configurable delivery charge approved
in ADR 0014 decision 10, narrowed by the owner to **three customer choices**.

## Context

Every order before this change shipped with `shipping_minor = 0` and the storefront told the customer
delivery would be arranged on confirmation. That was an honest gap, not a price. The owner has now
approved a pricing model simple enough to operate and explain:

- the customer chooses **Dhaka**, **Chattogram** or **Other districts**;
- **Other districts** uses one required default charge;
- **Dhaka** and **Chattogram** may each have their own charge, and use the default when they do not;
- delivery is still cash-on-delivery; no courier integration or delivery promise is added.

An earlier draft used all 64 districts. The owner replaced it with these three areas: a long taxonomy
adds no pricing power here and makes both checkout and configuration harder to use.

## Decision

### 1. The customer chooses exactly one of three stable area codes

```
dhaka | chattogram | others
```

`src/lib/delivery-areas.ts` is the single canonical list, imported by checkout and the owner settings
screen. Matching is by code only. The free-text address, area and city fields are **never** matched,
parsed or guessed. The customer still supplies the full address; the area selection is separate.

### 2. Configuration is one default plus two optional overrides

- `delivery_setting` is a singleton row (`id = 1`). `default_minor` is the required charge for
  `others`, and may be `NULL` only while the owner has not configured it.
- `delivery_district_charge` holds at most one row per code (unique index). `is_active = false` returns
  an area to the default while preserving its history. Saving again reactivates the same row.
- Only `dhaka` and `chattogram` accept an override; an override for `others` is refused.
- Amounts are entered in taka, parsed by the shared `parsePoisha` (integer poisha, max two decimals,
  zero allowed, negative/malformed/formatted values refused). The simplification did not weaken validation.

### 3. Pricing is server-authoritative and snapshotted

Order creation, inside the existing transaction:

1. validates the area code;
2. reads the active override, otherwise the configured default;
3. **refuses the order** when the default is unconfigured - it never silently charges zero;
4. writes `items_subtotal_minor`, `shipping_minor`, `total_minor = subtotal + shipping` and the selected
   `order_contact.district_code` together with the order.

The request has no delivery field to forge: it can send an amount or total, and the route ignores both.
`order.shipping_minor` is the immutable snapshot. A later settings change never rewrites an order.

### 4. Historical orders are not rewritten

Orders placed before this change have `order_contact.district_code = NULL` and `shipping_minor = 0`.
They keep saying delivery was arranged on confirmation. No backfill invents an area or a charge.

### 5. Authorization, audit and language

Configuration requires the existing owner-level `settings.write` permission. Every write and its
`audit_event` commit together (`delivery.default_updated`, `delivery.district_saved`,
`delivery.district_deactivated`). English and Bangla are both required.

## Consequences

- The customer sees subtotal, delivery and total at checkout, on the confirmation/history and in the
  owner's COD cards.
- Until the owner sets a default, checkout is **blocked** with a clear message. This is intentional:
  an unset price must not become free delivery.
- Delivery charges remain a single per-order amount. There is no weight, quantity, courier, payment
  method, postal-code or distance pricing.
- Order totals are immutable; changing configuration affects only new orders.
- `order_contact.district_code` and the table name `delivery_district_charge` retain their original
  names, but now store **delivery-area codes** from the three-value list. Renaming them would be a
  destructive migration with no behavioural benefit.

## Not decided here

Courier booking, tracking, delivery notifications, failed-delivery fees, free-delivery thresholds,
pickup, and any online-payment work remain out of scope.
