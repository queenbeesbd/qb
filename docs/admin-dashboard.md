# Admin dashboard - scope and design direction

> **Scope (ADR 0008).** This dashboard administers **one store** for that store's **owner** (and, only
> where justified and approved, named staff). It is not a merchant or vendor console: there is no
> seller onboarding, no multi-store switcher, no commission or payout surface, and no per-tenant
> configuration. "Merchant" appears in this document only where it refers to the **payment
> counterparty** - the store's own bKash/Nagad account that an administrator reconciles against.

Status: proposal, 2026-10-11. Direction approved in `docs/decisions/0004-independent-platform-direction.md`; architecture in `docs/platform-architecture.md`. Nothing here is built.

The Zatiq Easy dashboard was audited in Phase 7 (`docs/backend-capability-audit.md`) and is used here as a **reference for familiar merchant workflows and information hierarchy only**. Its branding, proprietary assets, vendor navigation and full feature set are explicitly not copied.

## Purpose and constraints

A purpose-built dashboard for a **comparatively small cosmetics retailer**. The Zatiq reference is built for thousands of merchants at arbitrary scale, which is why it carries theme builders, landing-page builders, subscription billing, mobile-app tooling and reseller modules. None of that is a QueenBee's requirement.

Design constraints inherited from the storefront's approved design system:

- Restrained, data-dense, professional. This is a working tool, not a marketing surface.
- Brand anchors `#A680FF` and `#F6B3CC` are used deliberately, not painted over every surface. Filled actions use `--color-action` (`#56358C`) because white on `#A680FF` fails contrast at 2.94:1.
- CSS Modules plus the existing custom-property tokens. No UI component library and no animation library without a demonstrated need and approval.
- Bangla and English both work: no letter-spacing on Bengali text, no fixed-height text containers, and font weights restricted to 400/500/600/700.
- All money is integer poisha and formatted in BDT.
- No fabricated metrics. Where data is missing or insufficient, the interface says so.

## Module scope

### Launch-critical

These are required for the store to trade. Without them, orders cannot be fulfilled or the catalog cannot be maintained.

| Module | Launch-critical content |
| --- | --- |
| **Products** | Create, edit, unpublish; brand, category, bilingual name and description; images; price and comparison price; stock quantity; SKU |
| **Categories** | Create and edit; bilingual names; display order; visibility; optional image or SVG mark |
| **Orders** | List with filters; itemized detail with frozen line prices; status transitions with history; payment status; shipping details; cancellation |
| **Payments** | Manual MFS verification queue; verify/reject actions; duplicate-reference flags; audit trail (see below) |
| **Customers** | Profile with order history; minimal personal data |
| **Shipping** | Delivery areas and charges; consignment reference and delivery status |
| **Store settings** | Store identity and contact; supported languages; announcement bar content; delivery and payment policy text |
| **Access and audit** | Staff login; role-based permissions; audit log for sensitive changes; secure session handling |

### Launch-adjacent

Needed shortly after trading starts, but not on day one.

| Module | Content |
| --- | --- |
| **Dashboard home** | Revenue and order summary, recent orders, low-stock alerts, actionable tasks |
| **Analytics** | The charts in the next section |
| **Promotions** | Discount codes with validity windows, eligibility and usage limits; featured and collection curation |
| **Order expiry** | Automatic expiry of an unpaid order **24 hours after placement**, applying only to orders with no submitted claim, with stock release and customer notification (policy in `docs/payment-workflow.md` section 13.9) |
| **Refunds** | Manual refund workflow with separate `requested`/`processing`/`completed`/`failed` states, updated only when the real-world action is confirmed (policy in `docs/payment-workflow.md` section 13.6) |

### Later

| Module | Condition |
| --- | --- |
| Variants and option combinations | Only if the real catalog needs them |
| Bulk operations | Only when manual editing becomes a demonstrated bottleneck |
| Customer accounts | **Required for ordering (D12, approved).** Customers may browse and build a cart as guests, but must register or log in to place an order. Customer records therefore exist from launch, with the associated privacy and access-control obligations |
| Courier API integration | After couriers are chosen and a sandbox exists |
| Customer retention analytics | Only with enough reliable data to be meaningful |
| Staff account recovery and MFA | Before more than one or two staff use the system |

### Explicitly excluded

Theme builder, landing-page builder, subscription system, proprietary mobile-app tooling, reseller and wholesale modules, affiliate programme, and vendor growth features. These are excluded because no independent QueenBee's requirement justifies them - not because they are technically difficult.

## Payments module - manual verification queue

Approved launch model: manual mobile financial service payment verified by a human. Design in `docs/payment-workflow.md`; controls in `docs/security.md`.

This module is **launch-critical**: without it, no order can be confirmed and no money can be reconciled.

### The queue

- Orders in `awaiting_verification`, **oldest first**, each showing how long it has waited. Age is the primary sort because an unverified payment is a customer waiting.
- Per row: order reference, order total, claimed amount, payment method, transaction reference, sender number (if supplied), and time since submission.
- **Duplicate-reference flag:** if the same reference appears against more than one order, all affected rows are marked before any decision. This is the control that stops one transfer being counted twice.
- **Amount mismatch:** a claimed amount that differs from the order total is surfaced prominently and requires explicit acknowledgement. The order total is authoritative; the claimed amount is recorded, never trusted.
- The queue exposes no customer data beyond what the verification task requires.
- **Exceptions queue (`verification overdue`):** an order still awaiting verification past the **approved 24-hour maximum** is flagged and sorted above newer submissions. It is **never expired automatically**, and its **stock reservation stays held**, because a genuine payment may exist. The owner must resolve it explicitly - verify, reject, mark falsely claimed, or escalate to support.
- **Expiry is a separate, visible list:** orders in `awaiting_payment` approaching their **24-hour** expiry window are shown so staff can see what is about to lapse. Expiry applies **only** to orders where the customer never claimed payment; an order awaiting verification is never expired by a timer.

### Actions

Three actions - **verify**, **reject**, and **mark falsely claimed** - all server-side authorized per request and all idempotent, so a double click or a retry cannot produce a second decision.

**`rejected` and `falsely_claimed` are different facts.** `rejected` means receipt could not be confirmed, which includes a delayed transaction or a mistyped reference - it is **not an accusation**. `falsely_claimed` means an admin **confirmed** the claim was false. Only the latter may flag the customer account for review, and it is **never set automatically**.

Each decision records, append-only:

| Field | Notes |
| --- | --- |
| Order reference | The subject |
| Decision | `verified`, `rejected` or `falsely_claimed` |
| Actor | Authenticated staff identity - never free text |
| Timestamp | Server time, not client-supplied |
| Reason | Required on rejection and on a false-claim finding |
| Prior status | The state moved from |

**Customer review flag.** Marking a claim false may set a **separate** flag on the customer account, with its own reason, actor and timestamp. The flag is independent of order and payment status, does not by itself close or block the account, and is reversible by an admin with an audit record. An ordinary unpaid order never sets it.

### Authorization and audit requirements

- Verifying a payment is a **permissioned action**, checked server-side on every request. Hiding the button is not access control.
- The storefront has **no writable path** to `verified`, `rejected`, `falsely_claimed`, any COD approval state, or `refund_status`.
- The audit log records the **decision**, not the customer's financial details. The transaction reference lives on the payment record where it is operationally needed and is not duplicated into general application logs.
- Screenshots are **not collected** (D8: not required, not requested, not stored). If that decision is ever reversed, they are stored privately, access-controlled, validated server-side and deleted on a defined schedule.
- Periodic reconciliation compares verified payments against the merchant statement and flags discrepancies.

### COD orders

Cash on Delivery is an **approved payment method (D7)** and is **not** part of the verification queue - there is no customer transfer to verify. Requirements:

- **COD approval queue (approved):** every COD order is **manually approved by the owner before dispatch**. Until approved it holds `cod_pending_approval` and is not dispatched. Approval is a permissioned, audited action.
- COD orders are identified as such in the order list and detail, so staff never wait for a verification that will not arrive. They have **no** sender number, transaction reference or verification step.
- The dashboard records courier consignment and delivery outcome, and the cash collected, so COD revenue can be reconciled against courier settlement.
- Cash collection (`cod_collected`) and delivery failure (`cod_failed`) are **distinct states**, separate from order status and from refund status.
- **Approved COD lifecycle (13.9.3):** cancellation before dispatch goes through support; after dispatch it is a delivery cancellation/return; failed delivery or refusal leads to **return-to-store** handling; returned goods become sellable only after physical receipt and inspection. Delivery completion, cash collection and cash reconciliation are **separate states**.

### Explicitly out of scope at launch

Automated gateways, webhooks, automatic payment confirmation, automated refunds, and any provider API integration. **No automated gateway is authorized (D7).** The manual workflow must be secure and usable without them.

### Expiry, cancellation and refunds

Policy: `docs/payment-workflow.md` section 13. Approved rules:

- **Expiry is automatic and system-driven**, and applies **only** to orders in `awaiting_payment` - orders where the customer never claimed payment. Orders awaiting verification are **never** expired by a timer. **The duration is 24 hours from placement.** An expired order may be reactivated only after re-checking stock, and an expired reservation is never silently revived.
- **Cancellation** is requested **through support with the order ID**. Every cancellation records actor, timestamp and reason and releases stock through the ledger, and there is **no customer self-service cancellation**. **Before dispatch**, support may approve a cancellation at any time; **after dispatch** the request is handled as a **delivery cancellation / return**, following the documented delivery and return process.
- **Refunds** are manual through support. `refund_status` is a **separate field** with `requested`, `processing`, `completed` and `failed` states, recorded append-only with actor, timestamp, amount and reason. **The dashboard must never show a refund as completed merely because it was requested or approved.**
- **Stock and refunds are separate facts, and a refund never restores stock by itself.** Two different mechanisms apply: (a) a **pre-dispatch cancellation** releases a reservation for goods that never left the store, so the unit returns to sellable immediately; (b) a **return**, or a returned or refused COD parcel, restores stock **only after the goods are physically received and inspected** (13.10.10). A refund record has no link to inventory at all, so completing a refund cannot make stock sellable. The dashboard must never claim sellable stock that is not in hand.
- Expiring or cancelling an order shows the customer the consequence, so a lapsed order never looks like a lost one.

### Owner decisions

**Answered by the owner:** payment methods, required customer fields, the verification maximum, the fake-order rule, cancellation through support, manual refunds, COD approval before dispatch, the **24-hour unpaid-order expiry**, **cancellation after the window**, the **COD lifecycle**, and the **D11 allocation rule and bound**.

**Still needed, none of it blocking Phase 10:** recipient accounts, which roles may verify and record refunds (D10), courier providers and COD cash-settlement terms, notification channels, and the reconciliation cadence - see `docs/payment-workflow.md` section 13.9.3.

## Analytics design direction

Analytics exists to answer business questions. A chart that answers no question is decoration and is not built.

### Questions and charts

| Business question | Chart | Notes |
| --- | --- | --- |
| How are sales changing over time? | Revenue over time, line or bar | Selectable range; comparison against the previous equal-length period |
| How many orders are pending, fulfilled or cancelled? | Order status distribution | Single stacked or grouped bar. Statuses come from the order state machine, so counts always reconcile with the order list |
| Which products and categories generate the most revenue? | Ranked bar, top N | Revenue, not unit count, is the default sort. Show the time window used |
| Which products are running low on stock? | Low-stock table with threshold | A table, not a chart. Charts hide the specific product names the merchant needs to act on |
| How much revenue is associated with discounts? | Discounted vs undiscounted revenue | Must be labelled as "revenue on discounted orders", never as "revenue lost" - the latter is an unsupported claim |
| How do order volume and average order value change? | Dual series, two axes or two small multiples | AOV is derived (revenue ÷ orders) and both parts are shown so the derivation is visible |

### Requirements

- **Meaningful ranges.** Presets for 7 / 30 / 90 days and a custom range. Every chart states the period it covers.
- **Comparisons.** Where a period-over-period comparison is shown, the previous period is explicitly labelled.
- **Currency.** Integer poisha formatted as BDT. Bengali digits and the `৳` prefix in Bangla; Latin digits and `Tk` in English - the storefront's existing rule, reused.
- **Labels and accessibility.** Every chart has a title, axis labels and units. Legends are real text, not colour-only. Colour is never the sole carrier of meaning, and the palette must hold up in the same contrast budget as the storefront.
- **States.** Loading, empty, error and partial-data states are designed, not left to fall through. "No orders in this period" is a valid and common result.
- **Responsive.** Charts must remain readable on a phone. A dense table may become a simpler summary rather than a squeezed chart.
- **Missing data.** If a period has no data, the chart says so. Nothing is interpolated to make a line look continuous, and no metric is estimated from an unrelated one.
- **No invented insight.** No "trending up" prose, no projections, no fabricated comparisons. The dashboard reports what the database contains.

### Implementation approach

Evaluate before adding a dependency, in this order:

1. **Plain SVG + CSS** for simple cases - a bar chart, a sparkline, a status distribution. The storefront already ships hand-authored SVG icons, so this is consistent with the project's existing approach and adds nothing.
2. **An existing project-compatible component**, if one is already present and suitable. None is today.
3. **A chart library**, only if custom work would be more expensive to build and maintain than the dependency is. Candidates to evaluate then include Recharts, visx and Chart.js. The evaluation must cover bundle size, accessibility support, SSR behaviour, theming to project tokens and maintenance status.

A dependency is not added for the first dashboard charts. The initial charts are simple enough that hand-authored SVG is the smaller commitment, and it avoids committing the project to a library's theming model before the dashboard's visual language is settled.

## Data and trust rules

- Every figure shown comes from the database, computed server-side. No dashboard metric is calculated in the browser from partial data.
- Authorization is enforced on the server for every admin operation. Hiding a button is not access control.
- Customer personal data is minimised at collection and access-controlled at read. Staff see what their role requires, not everything.
- Sensitive administrative changes - price, stock, order status, permissions - are written to an audit log with actor, timestamp and before/after values.

## Open questions for the owner

1. Which modules are genuinely needed on launch day versus after trading begins?
2. Who will operate the dashboard, and what roles are required?
3. Is order fulfilment handled by staff, by courier pickup, or both?
4. Are refunds and cancellations handled in the dashboard, or by exception outside it?
