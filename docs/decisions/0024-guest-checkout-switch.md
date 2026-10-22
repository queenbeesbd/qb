# ADR 0024 - Guest checkout is an owner switch

- Status: accepted (owner decision, 2026-10-23)
- Phase: 42
- Reverses the *unconditional* half of D12 (ADR 0009). The safe default is unchanged.

## Context

D12 settled that ordering requires an account: guests browse and build a cart, then sign in, with the
cart preserved across the step. That is still the right default, but not the only way to run this shop -
the owner wants a first-time buyer to be able to order without an account, and wants the choice to be
theirs, from the panel.

## Decision

1. **A stored setting, off unless written.** `store_setting['checkout.guest_orders']`. Absent means
   **off**: an unset policy must never widen who can order, so a fresh database behaves exactly as D12
   did. The owner turns it on at **Settings -> Other settings**.
2. **A guest order has no account.** `order.customer_id` is nullable (migration 0010); the order carries
   its contact block and nothing else. Consequences are stated rather than hidden: no order history, no
   account to ban, and the only receipt is the confirmation page.
3. **The mobile number is required**, as it always was: checkout refuses without `recipient_name`,
   `recipient_phone`, `address_line`, `area` and `city`, for guests exactly as for customers.
4. **No session means no CSRF token, and that is not a hole.** The guest path is protected by the
   same-origin check (a cross-site post is `403`), the per-render idempotency key (an unguessable
   submission handle that also prevents double orders), and the same server-side validation every other
   order gets. A signed-in request with a bad CSRF token is refused, never quietly downgraded to a guest.
5. **A guest confirmation is a capability URL, not a lookup.** `/account/orders/<number>` accepts an
   anonymous visitor only for an order whose `customer_id` is null; a customer's order number returns
   **404** to a guest. There is no order search, no email lookup and no phone lookup.
6. **A guest is never a customer by accident.** The order event records actor `guest` (the schema requires
   an event with no actor id to be `guest` or `system`), and a promo redemption records
   `customer_id = null`: the redemption is a fact about the order.

## Consequences

- The shop can take a first order without sign-up friction, and the owner can switch it off at any time;
  existing guest orders are unaffected.
- Guest orders appear in the COD worklist and the dashboard like any other order; the admin reads tolerate
  a null customer.
- **Not built:** claiming a guest order into a new account, guest lookup by phone or email, notifications
  to a guest, and any per-source throttle. That last one is the honest gap - a determined spammer with
  rotating keys is limited only by the existing request path, and a throttle is the next thing to add if
  it is ever abused.

## Verification

- Switch **off**: `GET /checkout` redirects to sign-in (307), as before.
- Switch **on**: `GET /checkout` renders anonymously; a guest POST created `QBBFC7E4396F6C7FA6` with
  `customer_id` null, `shipping_minor` 10000 (Dhaka), total = subtotal + shipping, and `order_placed`
  actor `guest`; the confirmation renders to a browser with no cookie at all.
- A cross-site guest POST is `403`; a **customer's** order number returns `404` anonymously.
- `typecheck`, `lint`, `check:i18n`, migrations applied and validated.
- **Not verified:** a real browser click-through of the guest form (this dev server serves a stale
  production `.next`, so client behaviour cannot be exercised), and any abuse behaviour.
