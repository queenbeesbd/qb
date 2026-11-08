# 0021 - Deriving analytics, and promotion codes as a derived fact

- **Status:** accepted (implemented locally, not deployed)
- **Date:** 2026-10-23
- **Phase:** 38
- **Supersedes:** nothing. **Narrows:** nothing.

## Context

The owner asked for three things after comparing the admin panel with **Zatiq Easy**, which is the
platform their current shop runs on: dashboard graphs, a real analytics screen, and promotion codes that
actually work at checkout. The three Zatiq screens (dashboard, order report, promo codes) were inspected
with the owner's explicit written authorization and their own account, **as a UX reference only**. No
Zatiq endpoint, cookie, tenant identifier or internal API is used by this product, and none is
documented - the independent-platform direction (ADR 0004) is unchanged.

Two questions had to be answered before any code:

1. Where do the numbers come from, when this product ships no analytics vendor?
2. What exactly is a promotion code, given that **refunds are deferred**, **COD is the only payment
   method**, and the dashboard already refuses to call gross payments "revenue"?

## Decisions

### D1 - Analytics are derived from order rows on read, and nothing is counted

Every figure on the dashboard and the analytics screen is an aggregate over `order`, `order_item`,
`order_additional_cost` and `promo_code_redemption` computed in the request. There is **no counter
table**, no materialised rollup and no job. A number therefore cannot drift from the rows it describes,
a repeated submission cannot double it, and a refund (out of scope) could never be netted into it
silently.

**Money is counted once, and only when it exists.** Revenue is `sum(total_minor)` over orders that are
**completed and paid** (`status = 'completed' and cod_state = 'cod_collected'`). A dispatched or
delivered parcel is not revenue, and an order that was never paid contributes nothing.

### D2 - Two clocks, kept apart and labelled

- **Money facts** (revenue, items sold, customers served, discounts, courier costs) are bucketed by
  `completed_at` - the moment the owner recorded that payment arrived.
- **Workload** (orders placed, the status mix) is bucketed by `placed_at`.

The two are never added together, and the interface names which is which. A single blended "orders"
figure would be ambiguous the moment an order is placed on one day and paid on another.

### D3 - The shop's calendar is Bangladesh time

Day buckets are cut in `Asia/Dhaka`, in SQL, because "today" for this shop means Dhaka's today. The
alternative - bucketing in the database session's timezone - files a 1 a.m. order under the previous
day, which is wrong for the person reading the screen. This is a statement about where the shop is, not
a configurable report setting.

### D4 - No traffic, visits or page-view figures

There is no analytics tracker, no cookie, no pixel and no session recording, so there is no visit
count to report. The analytics screen **states that gap** instead of filling it with a number nobody
measured. Zatiq shows a "website visits" tile; this product deliberately does not, because inventing
one would be a lie with a decimal point.

### D5 - Charts are drawn in SVG, in this repository

The dashboard needs a line and a ring. No chart library is added: it would bring a runtime, a theme
system and a bundle to draw roughly forty lines of geometry, and it would decide typography for us.
Instead `_ui/charts.tsx` renders two plain components with no state:

- the plot is a fixed coordinate space scaled to its container, with `vector-effect="non-scaling-stroke"`
  so the line stays 2px on a phone;
- axis text is **HTML beside** the plot, never scaled SVG text;
- the SVG is `aria-hidden`, and the same values are emitted as a screen-reader table;
- a window with no data draws a sentence, not four zero ticks.

### D6 - A promotion code is a rule, and a use is an order row

Two tables (migration `0008`):

- **`promo_code`** - the rule: code string, kind (`percent` | `fixed`), percentage or amount, minimum
  order, optional percentage cap, optional start and end, optional usage limit, active flag, actor and
  timestamps.
- **`promo_code_redemption`** - one row per order that used the code, with `order_id` **unique** and
  the discount it was given. Append-only by trigger: a use is a fact, and deleting one would quietly
  refund a use.

**How often a code has been used is `count(*)` over those rows - never a counter on the code.** The
`max_redemptions` rule is therefore enforced by counting inside the order's own transaction, with the
code row locked (`for update`) first, so two simultaneous checkouts cannot both take the last use.

**The discount is an immutable snapshot on the order.** `order.discount_minor` joins the frozen charged
amount (the `order_immutable_columns` trigger now covers it), because editing a code later must never
rewrite what a customer was charged. `total = items_subtotal - discount + shipping`, enforced by a CHECK
constraint. The order rows keep working for orders placed before this phase: they carry `0`.

### D7 - One code per order, evaluated at use, never stacked

Stacking is not offered and the schema says so (`promo_code_redemption.order_id` is unique). A code
cannot be combined with a product's own comparison price as if they were additive: the code applies to
the **cart subtotal**, which is already the sum of the prices actually charged.

`starts_at` / `ends_at` are evaluated when a code is used. **Nothing runs on a timer**: there is no
expiry sweep and no scheduled publish. Switching a code off is the owner's explicit action, and it never
touches an order that already used it.

### D8 - A refused code refuses the order, it does not quietly charge more

The customer sees a total that includes the discount. If the code cannot apply at the moment of
submission (paused, ended, limit reached, cart changed under the minimum) the order is **refused with a
notice** rather than placed at full price. A silent overcharge is the one outcome that is never
acceptable, even though the refusal costs a sale.

The checkout preview and the order transaction share one evaluator (`src/lib/promo.ts`) and one line
pricer (`resolveOrderLines`), so the discount that is quoted is the discount that is stored.

### D9 - Permissions and audit

- Promotion CRUD is gated on **`settings.write`**, the privileged permission that already governs the
  delivery charges: a code sets what a customer is asked to pay, which is a money policy.
- The analytics screen reads orders and is gated on **`order.read`**: it is another view of rows that
  permission already opens.
- Writes are audited as `promo.created`, `promo.updated`, `promo.activated`, `promo.deactivated`.
  **A redemption is not audited** - the order and its event log are the record, and duplicating it would
  create two sources of truth for the same fact.

## Consequences

- **Schema 43 -> 45 tables**, plus `order.discount_minor` and a widened immutability trigger.
- New admin surfaces: `/qbpanel/analytics`, `/qbpanel/promo-codes`, `/qbpanel/promo-codes/new`,
  `/qbpanel/promo-codes/[id]`, and one mutation endpoint `/api/qbpanel/promo-codes`.
- One new customer-facing endpoint, `POST /api/checkout/promo`, which writes nothing and requires a
  customer session and CSRF.
- The dashboard is reorganised around the shop's last thirty days, with the COD worklist immediately
  below the figures: the previous "no metric scaffold" position is superseded by the owner's request for
  graphs, but the queue is still above every table.
- `verify:browser` and `verify:admin` do **not** yet cover the new screens; the evidence for this phase
  is the unit suite, the database suite, and a Chromium walk-through recorded in Phase 38's entry.

## Deliberately not built

No coupon links, no automatic campaigns, no first-order-only rule, no per-customer limit, no free
delivery code, no checkout banner, no referral attribution, no A/B reporting, and no third-party
analytics. Each is a **new owner decision**, and the first three would change the schema again.
