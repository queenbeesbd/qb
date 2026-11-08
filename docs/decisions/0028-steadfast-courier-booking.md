# ADR 0028 - SteadFast courier booking on COD confirmation

**Date:** 2026-11-08
**Status:** Implemented locally, not deployed
**Owner decision:** Book a confirmed COD order with SteadFast automatically, and let the owner enter
the courier credentials in the admin panel.

## Context

Every order this shop takes is Cash on Delivery (ADR 0015). The owner confirms each order by phone in
the confirmation queue, and until now the parcel existed only as an order row: the courier had to be
told by hand, and the consignment id and tracking code lived outside the product.

SteadFast Courier publishes a small JSON API (`docs` supplied by the owner, base URL
`https://portal.packzy.com/api/v1`) authenticated with an `Api-Key`/`Secret-Key` header pair:

- `POST /create_order` - one consignment, keyed by a unique `invoice`, with a `cod_amount` in BDT;
- `GET /status_by_cid/{id}` - the delivery status of one consignment;
- `GET /get_balance` - the account balance, used here only to prove a credential pair works.

## Decision

1. **Booking happens when the owner approves a COD order**, immediately after the approval
   transaction commits. Approval is the owner's stated fact that the order was confirmed by phone, so
   it is the moment a parcel may be handed to a courier. No timer, no batch and no background sweep
   books anything, and rejecting an order books nothing.

2. **Booking is a separate transaction from the approval.** A courier outage must never undo a
   decision the owner made on the phone. A failed booking leaves the order approved at
   `cod_state = cod_approved`, `status = confirmed`, records `order.steadfast_booking_failed` in its
   own transaction, and is retried from the order screen.

3. **Booking never changes an order state.** `order.status`, `order.cod_state`, payment, refund and
   stock are untouched by a booking, a failure or a status refresh. The courier's delivery status is
   a stored mirror (`steadfast_consignment.status` + `status_checked_at`), not an order lifecycle. In
   particular a `delivered` status from SteadFast does **not** complete the order or record cash:
   payment receipt remains the owner's explicit action (ADR 0017).

4. **One consignment per order, including under a race.** `steadfast_consignment.order_id` is unique,
   the `invoice` and the courier's `consignment_id` are unique, and the booking takes a
   transaction-scoped advisory lock on the order. A second request answers "already booked", and the
   order screen shows the stored consignment instead of offering a second parcel.

5. **The credentials live in `store_setting`, not in the process environment.** They are entered at
   **Settings -> Integrations -> SteadFast**, written under `steadfast.api_key`,
   `steadfast.secret_key` and `steadfast.enabled`, and are **never** sent to the browser, logged,
   placed in a redirect, or written to an audit record. The screen and the audit entry carry only
   whether each key exists and its last four characters. This differs deliberately from the Telegram
   bot token (ADR 0022), which is deployment-only: a courier key is merchant-issued and rotatable, and
   requiring a redeploy to rotate it would leave a dead credential in place. The keys are read
   server-side only, and `store_setting` is never projected to a storefront page.

6. **Booking is a switch, off by default.** Saving both keys does not start sending parcels by itself;
   the owner switches **Send confirmed COD orders to SteadFast** on. Switching it on requires both
   keys to be present, so the shop cannot be left in a state where approval silently produces failures
   nobody noticed.

7. **The amount to collect is the order's frozen total.** `cod_amount` is `order.total_minor`
   converted to BDT (goods minus discount, plus delivery), never a re-derived price, a discount, or a
   figure from the browser. The consignment row stores the same poisha amount that was booked.

8. **Provider limits are applied, not guessed.** The invoice is the order number (`QB` plus 16 hex
   characters, already `[A-Za-z0-9_-]`); the recipient name and the composed address are clipped to
   SteadFast's own 100/250-character fields, because a confirmed parcel must not be blocked over
   whitespace and the shop's own record keeps the full value; a phone that is not an 11-digit
   Bangladeshi mobile and a missing address are refused **before** the call, with the reason stored.

## Consequences

- `/qbpanel/orders-cod` states whether the approval was booked, and the order screen carries the
  consignment, the courier's delivery status with the time it was read, a **Refresh status** action
  and **Send to SteadFast** for a retry.
- One new table, `steadfast_consignment` (migration `0016`), so the schema is **51 tables**. It
  stores ids, invoice, status and the COD amount - never the request body, the customer's details
  again, or a credential.
- No new permission: sending a parcel is re-authorized as `cod.approve` (privileged), and refreshing a
  status requires `order.read`.
- `STEADFAST_API_BASE_URL` is honoured by the client **only** when the process declares a development
  environment. It exists so local verification can point at a stub courier; a preview or production
  deployment cannot be redirected by it.
- The `invoice` sent is the order number. SteadFast treats an invoice as its idempotency key, so a
  duplicate send is refused by the courier even if the store's own guards were bypassed.
- Deliberately out of scope: label printing, pickup requests, bulk create, fraud check, courier
  statement import, automatic order transitions from courier events, and any courier other than
  SteadFast.
