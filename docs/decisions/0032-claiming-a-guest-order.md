# ADR 0032 - A guest order can be claimed into an account, once

- **Status:** accepted, 2026-11-09 (owner instruction)
- **Amends:** the `order.customer_id` half of the order identity rule in
  `drizzle/0001_guards_and_privileges.sql`; ADR 0024 (guest checkout), ADR 0029 (repeat-customer rule)
- **Touches:** `docs/data-model.md` (order identity), `docs/security.md` (13.x order reads),
  `AGENTS.md`, migration `0019_pink_blonde_phantom`

## Context

A guest can order without an account (ADR 0024). The receipt at `/orders/<number>` is then the only
record of that order: no history, no way back after the link is lost, and the shop cannot count the
person as a returning customer because `order.customer_id` is `null` (ADR 0029).

The owner asked for the obvious improvement: after a guest places an order, **ask** whether they want
it in an account, and if they sign in or register, make the order theirs - so it appears in their
history and their next delivery is quoted as a returning customer.

## Decision

### 1. The receipt asks; the customer answers with one action

The receipt renders three mutually exclusive states, each a fact about the order's owner:

| Viewer | What they see |
| --- | --- |
| No session (guest) | **"Keep this order in an account"** with **Sign in** and **Create an account**, both returning to this receipt |
| Signed in, order is a guest order | **"This order is not in your account"** and one button: **Add this order to my account** |
| Just claimed | **"This order is in your account now"** and a link to the order list |

The claim is **not** a side effect of signing in. It is a POST the customer makes, because taking
ownership of an order is a real change of who can read it forever, and it should be something the
person did rather than something that happened to them on a shared device.

### 2. Possession of the order number is not a new disclosure

The guest receipt has always been readable by number alone - that is what "this page's address is the
only way back" means. A signed-in customer looking at a guest order number therefore sees exactly what
an anonymous holder of that number sees; the page does not become a lookup service. What changes is
that the claim **permanently** binds that number to one account, so afterwards:

- the guest read (`customer_id is null`) no longer matches, so the URL is a **404** for everyone
  without a session;
- the customer read filters on the session's id, so any other account gets a **404**, not a 403.

### 3. The database enforces "once"

`order.customer_id` was in the immutable set, which is what made "this order belongs to that account,
forever" true. Migration `0019` narrows that rule to exactly one transition:

- `null` → a customer: **permitted, once**;
- a customer → a different customer, or → `null`: **refused** by
  `queenbees_guard_order_immutable_columns` (`23514`), whatever code path attempts it.

The claim itself is a transaction: the order row is locked (`for update`), the update is guarded by
`customer_id is null`, and the `order_event` row uses a unique `event_key` (`claim:<orderId>`), so two
simultaneous claims cannot both succeed and one claim cannot be recorded twice.

### 4. The claim is recorded as the customer's own event, not as an audit row

`order_event` gains the type **`order_claimed`** with `actor_type = 'customer'` and the customer id.
It is not an `audit_event`: D23 keeps customer activity out of the internal administrative and
security store, and there is no staff action here to audit. No money moves: `total_minor`,
`items_subtotal_minor`, `shipping_minor`, `payment_method`, the discount snapshot and every state
column are untouched, so a claimed order's figures still reconcile exactly as before.

### 5. The repeat-customer consequence is real and was wanted

`isRepeatCustomer` reads `order.customer_id` and `order.status = 'completed'` (ADR 0029). A completed
guest order that is later claimed therefore makes the account a returning customer for the **next**
delivery quote - the owner's stated goal. Two limits stay as they were: the repeat rate itself is
owner-configured and off by default, and nothing retroactively re-prices an order already placed.

## What was deliberately not built

- **No automatic claim on sign-in.** Signing in from the receipt returns the customer to the receipt,
  where the claim is one tap; the link between an order and an account is never made silently.
- **No guest order lookup.** There is still no way to find an order from an email or a phone number
  (OD-2 remains unanswered). A guest who loses the link still has no route back.
- **No unclaim, transfer or merge.** A claim cannot be undone, and two orders are never merged. A
  mistake is an owner-side support decision, not a shop feature.
- **No promise of a discount.** The interface says the order joins the account history. It does not
  advertise a repeat-delivery rate, because that rate is the owner's configuration and may be off.

## Verification

Recorded with the change: `tests/db/order-claim.test.ts` (6/6 - link once, idempotent repeat, second
account refused, unknown and malformed numbers refused, trigger refuses move and clear, claimed
completed order becomes a repeat fact, claimed order no longer readable by number alone), the
`safeCustomerNext` unit tests (the receipt is an allowed return target; a lookalike is not), and an
HTTP walk-through on a served build: guest order → register with `next` → receipt offers the claim →
claim → `?claim=claimed` → the order is in `/account/orders` → a third account gets 404 → an
anonymous visit gets 404.
