# Admin dashboard - scope and design direction

> **Scope (ADR 0008).** This dashboard administers **one store** for that store's **owner** (and, only
> where justified and approved, named staff). It is not a merchant or vendor console: there is no
> seller onboarding, no multi-store switcher, no commission or payout surface, and no per-tenant
> configuration. "Merchant" appears in this document only where it refers to the **payment
> counterparty**, and since ADR 0015 this release takes payment as **cash on delivery only** - no store
> bKash/Nagad account is configured or reconciled here.

Status: proposal, 2026-10-11; **reconciled 2026-10-16 against ADRs 0013 and 0014, 2026-10-17 against ADR 0015 (COD-only), updated 2026-10-19 when Phase 18 was implemented locally, and 2026-10-20 for ADR 0016 delivery charges**. Direction approved in `docs/decisions/0004-independent-platform-direction.md`; architecture in `docs/platform-architecture.md`. The owner/admin authentication, catalog, availability, COD queue, customer moderation, **the Phase 18 application shell and dashboard**, and **the Phase 19 delivery-charge settings** are **implemented (Phases 12-19, local only)**. Dispatch, cash-reconciliation, analytics and the other depth modules below are **not built**.

> **Reconciliation note (2026-10-16).** Three premises here are superseded:
> 1. **No reservation and no stock release.** Under **ADR 0013** availability is the only ordering gate and no reservation is written, so any text below about a held reservation, releasing stock through the ledger, or low-stock alerts describes **unused design**.
> 2. **Expiry is deferred.** Under **ADR 0014** the 24-hour expiry is **not a launch priority** and no scheduler is added; the binding rule is that **a submitted claim never expires**. The expiry list described below is deferred with it.
> 3. **Delivery charges are now implemented (ADR 0016).** Three areas (Dhaka, Chattogram, Other districts), one required default and two optional overrides, priced server-side and snapshotted on the order. The **amounts** remain owner inputs. The stack question in the "still needed" list is settled (D14/D18, ADR 0007).
> 4. **The prepaid payments module is gone (ADR 0015, 2026-10-17).** Cash on Delivery is the only method;
>    the verification queue, recipient configuration and `payment.*` permissions were removed. Any
>    prepaid text below is history.

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
| **Products** | Create, edit, unpublish; brand, category, bilingual name and description; images; price and comparison price; SKU; and the **availability state - In Stock / Out of Stock (D19, approved in ADR 0009)**, which is what the owner operates and what the storefront shows. An out-of-stock product cannot be ordered. The availability control is presented as a state, never as a quantity countdown, a restock date or an arrival promise. **Implemented in Phase 13.** Imagery is associated from **existing local assets only** - the image is chosen from a server-controlled inventory and its dimensions and content type are read from the file - because upload and object storage are deferred. **Not yet built:** variant editing (one default variant per product), curation, and bulk operations |
| **Categories** | Create and edit; bilingual names; display order; visibility; optional image or SVG mark. **Implemented in Phase 13** (names, descriptions, order, visibility). Archiving is **refused while products or subcategories still reference the category**, rather than cascading. The optional image mark is **not built** |
| **Orders** | List with filters; itemized detail with frozen line prices; status transitions with history; payment status; shipping details; cancellation |
| **Payments** | **Cash on Delivery only (ADR 0015).** The COD confirmation queue with approve/cancel, guarded transitions and an audit trail. The manual prepaid queue, its recipient configuration and its `payment.*` permissions were **removed in Phase 17** |
| **Customers** | Profile with order history; minimal personal data; **ban after a confirmed fake order (D20, approved in ADR 0009)**, which revokes the account's sessions and refuses new orders and checkout. The review flag is a separate, non-blocking finding and is never presented as a ban |
| **Shipping** | **Settings → Delivery charges (implemented in Phase 19, ADR 0016):** one required default for **Other districts** and optional separate charges for **Dhaka** and **Chattogram**, with edit, remove and reactivate. Customers choose exactly those three areas. The applied charge and area are snapshotted on the order. **Not built:** consignment reference, tracking and delivery status (no courier API, D6 open) |
| **Store settings** | Store identity and contact; supported languages; announcement bar content; delivery and payment policy text |
| **Access and audit** | **Owner login by email and password (D22, approved in ADR 0009).** **Owner role only at launch (D10):** multiple owners are permitted and each has full access, but there are no staff or support roles and **no permission-management system in the launch surface**. Audit log for sensitive changes **including refused actions**, kept distinguishable from customer/business activity records (D23). Secure session handling. **Implemented in Phase 13 as a minimal owner-account screen**: create an owner (the role is **forced**, never chosen), issue a single-use credential token, enable or disable an account, with the last-active-owner guard enforced under a row lock. **The Phase 12 staff and role screen, its navigation entry and its four API routes were removed**; the retired paths return 404, which `npm run verify:admin` asserts |

### Launch-adjacent

Needed shortly after trading starts, but not on day one.

| Module | Content |
| --- | --- |
| **Dashboard home** | Revenue and order summary, recent orders, low-stock alerts, actionable tasks |
| **Analytics** | The charts in the next section |
| **Promotions** | Discount codes with validity windows, eligibility and usage limits; featured and collection curation |
| **Order expiry** | **Deferred - not a launch priority (ADR 0014 decision 11).** A 24-hour automatic expiry of an unpaid order, applying only to orders with no submitted claim, with customer notification. **No scheduler or expiry job is added now**, and there is no stock to release (ADR 0013); a submitted claim never expires |
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

## COD module - the only payment surface

**Cash on Delivery is the only payment method in this release (ADR 0015).** The manual bKash/Nagad
verification queue, the payment-recipient configuration screen and every `payment.*` permission were
**removed from the application in Phase 17**. There is no prepaid queue in this dashboard, and no screen
should suggest one.

### The COD queue (`/admin/orders-cod`)

- Orders in `cod_state = 'cod_pending_approval'` **and** `status = 'pending'`, oldest first. Age is the
  sort order because a waiting COD order is a customer who has not been called.
- Per row: order reference, when it was placed, the total, and the delivery contact (name, phone, address).
  Nothing about payment is shown because there is nothing to verify: no sender number, no transaction
  reference, no claimed amount.
- **Implemented:** the queue, its count on the overview, the two decisions, and the audit trail.
- **The decision:** the owner calls the customer, then:
  - **Approve** → `cod_approved` and `status = 'confirmed'`, one `cod_approved` event, one
    `cod.approved` audit record with actor, reason and before/after.
  - **Reject** with a required reason → the order is **cancelled** while still `pending`, one
    `cod.cancelled` audit record. `cod_state` deliberately stays `cod_pending_approval` because the
    schema binds it to the payment method; the queue filters on the order status too, so a cancelled order
    leaves the worklist and cannot be "decided again".
- Both are guarded on prior state (a racing request updates zero rows and reads a conflict), audited in the
  same transaction, and require their own permission server-side.
- **Neither decision ever bans a customer.** A ban is a separate action on the customers screen (D20).

### What the COD module does not do yet

- No dispatch, consignment or courier record; no `cod_collected` / `cod_failed` / `cod_reconciled`
  transition; no cash reconciliation.
- No cancellation or refund workflow.
- No customer notification: the owner telephones, and the customer's own order page is the record.
- No expiry: `expires_at` is `NULL` for a COD order and no expiry writer exists.

### Authorization and audit requirements

- Every decision is permission-checked **server-side per request** (`cod.approve`, or `order.cancel` for
  a rejection). Hiding a button is not access control.
- The storefront has **no writable path** to any order state, COD state, cancellation or refund state.
- Each decision appends actor, timestamp, decision, prior state and reason. A refused attempt is recorded
  durably in its own transaction, attributed to the acting session.
- Personal data on the queue is limited to what the call requires: name, phone, address, total.

### Explicitly out of scope for this release

Automated gateways, webhooks, automatic payment confirmation, automated refunds, and any provider API
integration. **No automated gateway is authorized (ADR 0015)**, and the retired manual prepaid screens
must not be reintroduced.

### Expiry, cancellation and refunds

Policy: `docs/payment-workflow.md` sections 1 and 13 (the latter as historical design).

- **Expiry:** no expiry writer or scheduler exists, and a COD order carries `expires_at = NULL`. The
  24-hour unpaid-order expiry is **deferred (ADR 0014 decision 11)** and is not a launch dependency.
- **Cancellation** is requested **through support with the order ID**. Every cancellation records actor,
  timestamp and reason. **No stock ledger entry is written (ADR 0013).** There is **no customer
  self-service cancellation**. **Before dispatch** support may approve a cancellation; **after dispatch**
  the request is handled as a **delivery cancellation / return**.
- **A COD rejection is a cancellation**, not a different state: it guards `status = 'pending'` and leaves
  `cod_state` bound to the method (see the COD module above).
- **Refunds** are manual through support. Refund state lives in the separate **`refund` table** (`refund.state`) with `requested`, `processing`, `completed` and `failed` values, recorded append-only with actor, timestamp, amount and reason. **The dashboard must never show a refund as completed merely because it was requested or approved.**
- **Stock and refunds are separate facts, and a refund never restores stock by itself.** A refund record has no link to inventory at all, so completing a refund cannot make stock sellable. A **return**, or a returned or refused COD parcel, makes goods sellable again **only after they are physically received and inspected** (13.10.10). **At launch there is no reservation to release on a pre-dispatch cancellation (ADR 0013)**, and the dashboard must never claim sellable stock that is not in hand.
- Expiring or cancelling an order shows the customer the consequence, so a lapsed order never looks like a lost one.

### Owner decisions

**Answered by the owner:** payment methods, required customer fields, the verification maximum, the fake-order rule, cancellation through support, manual refunds, COD approval before dispatch, the **24-hour unpaid-order expiry**, **cancellation after the window**, the **COD lifecycle**, the **D11 allocation rule and bound**, and - added 2026-10-12 in ADR 0009 - **availability as an owner-controlled In Stock / Out of Stock state (D19)**, the **customer ban after a confirmed fake order (D20)**, **owner-only administration with no staff roles or permission-management system at launch (D10)**, **owner authentication by email and password (D22)**, and **separation of customer/business activity records from internal security records (D23)**.

**Narrowed by ADR 0015 (2026-10-17):** the manual prepaid flow, its recipient numbers and its
verification evidence are **no longer needed** - the feature was removed. **Settled by ADR 0016 (2026-10-20):** three delivery areas
(Dhaka, Chattogram, Other districts), the default/override fallback, stable-code matching and the
order snapshot. **Still needed:** the actual BDT amounts; the COD failed-delivery/retry detail; what
evidence and cadence a cash reconciliation requires; retention periods for orders and customer data;
and, for **any future gateway**, the provider, fees, settlement, refund/dispute handling and scope. **Deferred and not gating:** the expiry
timer and external notification channels (ADR 0014 decisions 11 and 12). The availability-versus-quantity
question is **settled** (ADR 0013: availability is the only gate). *(Which roles may act was D10 and is
settled: owner-only, ADR 0009.)*

## Phase 18 design brief - dashboard UX (implemented locally, 2026-10-19)

**Status: implemented locally and verified; not deployed.** The brief below was prepared from the code as
it existed after Phase 17, using the project's own design system (`docs/design-system.md`,
`src/app/globals.css` tokens) and the installed Emil Kowalski design-engineering guidance. The delivered
shell, components, motion, responsive rules and their limits are recorded in
`docs/design-system.md` under *Admin surface*; verification evidence is in `docs/project-status.md`.

**What shipped:** the grouped rail and mobile drawer; the operational overview (COD worklist first,
attention second, quick access and catalog counts last); inline approval with a prefilled audit note and
a confirmed rejection with a required reason; server-side search plus waiting/decided-today filters;
product search, stock filter and the availability switch; category list/form consistency; a customer
detail page with recorded orders and a guarded suspension; and one notice/empty/error vocabulary.

**What the brief deferred and remains unbuilt:** dispatch/consignment, cash collection and reconciliation,
refund and cancellation recording, owner-operated customer credential reset, analytics, delivery-charge
configuration, and any route-level loading skeleton (rejected in Phase 18 because it weakens the refusal
contract - see `docs/design-system.md`). The status, rather than the customer account, is still the only
place a decided COD order appears; there is no order detail page yet.

### What the audit found (the evidence this brief rests on)

| Observation | Where | Why it matters |
| --- | --- | --- |
| The overview is a grid of **counts**, including catalog totals that do not change daily | `admin/(app)/page.tsx`, `OverviewView.tsx` | It answers "how much is there", not "what needs me now". The owner's first question in the morning is which calls to make |
| The COD queue is a **wide table** with two free-text forms per row and a required reason for approval | `admin/(app)/orders-cod/CodView.tsx` | The approve path is the most frequent action and it demands a 10-character reason typed into every row |
| Catalog and categories are **separate pages** with their own notice vocabularies and inline forms | `admin/(app)/catalog`, `categories`, and `api/admin/catalog/*` | The owner edits a product's price and availability in one place and its category in another; there is no shared "saved / refused" feedback pattern |
| Availability is a **binary control inside a form**, but it is the single most often changed field | `api/admin/catalog/availability/route.ts` | It is a state toggle promoted to a form post; it deserves a first-class control with optimistic feedback and audit confirmation |
| Empty states are one sentence, loading states are absent (server-rendered), errors arrive as `?notice=` codes | all admin routes | A refusal is invisible once the redirect lands unless the notice maps to copy; a slow query shows nothing at all |
| Customers are a list with a suspension form per row | `admin/(app)/customers/CustomersView.tsx` | Banning is destructive and irreversible from the UI; it needs a confirmation step with the reason visible, not a text field in a table row |
| Navigation is flat and permission-filtered at the layout | `admin/(app)/layout.tsx` | Correct, and worth keeping: one level, no nesting, no role-based menu logic beyond `hasPermission` |
| Every page is `force-dynamic` and hand-rolled CSS | app-wide | No caching surprises, but also no shared table/form/toolbar components - each page re-declares its own |

### The owner's tasks, in priority order

1. **Decide COD orders** - call, then approve or cancel. Highest frequency, highest business impact.
2. **See what is blocked** - anything that needs attention (a cancelled order, a suspended customer, a
   refused action the owner thought succeeded).
3. **Change availability** - take a product out of stock, put it back. Fast, reversible, audited.
4. **Edit catalog content** - price, name, description, category, brand, image.
5. **Look up a customer** - their orders, their standing, and suspend when justified.
6. **Read the audit trail** - after something looks wrong, not daily.

This ordering is **proposed**; the owner's confirmation is the first prerequisite of Phase 18.

### The brief

**A. One operational overview instead of a facts grid.**
Replace the count grid with three stacked blocks: (1) a **COD worklist summary** - count and the age of the
oldest waiting order, linking straight to the queue; (2) **needs attention** - open operational exceptions,
customers flagged for review, and refused actions from the audit trail, each linking to its subject;
(3) a collapsed **catalog state** line (published / in stock / out of stock) for reference, not as the
headline. Every number must be a query that already exists or a trivial count over an existing table; no
derived metric is invented.

**B. One order surface with the decision inline.**
The COD queue becomes a list of cards or a table with a clear primary action. Concretely:
- **Approve** is a single button; the required audit reason becomes an optional note with a sensible
  default ("confirmed by phone"), so the reason field stops being a typing tax while the audit record keeps
  an actor, timestamp and decision.
- **Cancel** stays deliberate: it opens a small confirmation with a visible reason field and states the
  consequence (the order is cancelled and leaves the queue).
- Rows show **age** prominently ("waiting 2 days"), because that is the operational fact.
- The phone number is a `tel:` link on touch devices, so the call is one tap.
- No dead-end: a decided order is not shown with disabled buttons; it leaves the list.

**C. Availability as a switch, not a form.**
A real toggle with a label ("In stock" / "Out of stock"), a pending state, and a confirmation that names the
audited action. It must still post the same server-checked endpoint; the UI only removes friction. A failed
change reverts visibly and states why.

**D. Catalog editing with one feedback pattern.**
One page per entity, one save button per section, one notice region. Editing a product's price, name,
availability and image should not require three navigations. Category and brand selectors show the current
value, and a refusal (slug taken, category still in use) appears next to the field that caused it rather
than as a page-level code.

**E. Customer history and bans with safeguards.**
A customer detail view: email, joined date, order count, last order, each order's status, and the flag.
Suspension moves behind a confirmation that (a) states that **sessions are revoked and new orders refused**,
(b) requires a reason, and (c) is styled as destructive. Un-suspending is a separate, equally explicit
action. **No bulk ban.**

**F. Search, filtering and bulk actions - only where they earn their place.**
- Add: COD queue filter (waiting / all decided today) and order-number search.
- Add: product search by name/SKU and a category filter - the catalog will outgrow one page.
- **Do not add** bulk approve, bulk availability, or bulk ban in Phase 18. There is no evidence the owner
  works in batches, and a bulk destructive action multiplies a mistake.

**G. Responsive, states and safety.**
- Every screen must be usable at 360px: tables become stacked cards, the primary action stays visible, and
  no horizontal scroll is required to decide an order.
- **Empty:** say what is empty and what to do next ("No COD orders are waiting. New orders appear here.").
- **Loading:** use route-level `loading.tsx` skeletons for the admin tree rather than a spinner on a blank
  page; keep them layout-identical to avoid shift.
- **Error:** a boundary that states the failure and offers retry, never a blank screen. Never swallow a
  refusal.
- **Destructive:** colour alone is not the signal - the label changes, the consequence is written, and a
  confirmation is required for suspension/cancellation. A decision must be idempotent server-side (it
  already is).
- **Motion:** restrained. 120-180ms `ease-out` transitions for state changes; no entrance animations on
  keyboard-driven actions; respect `prefers-reduced-motion`. No animation library.

**H. Components and tokens.**
Extract the repeated patterns into small server-rendered components plus a few client islands:
`AdminPageHeader`, `Notice` (one mapping from notice code to copy, one aria-live region), `DataTable`
(accessible table with a card fallback), `EmptyState`, `ConfirmAction` (dialog with a reason field),
`StatusPill` (order/COD/availability, colour **and** text), `Toolbar` (search/filter). All styling stays in
CSS Modules on the existing tokens - no new dependency, no component library, no chart library. Status
colours must meet the same contrast budget as the storefront, and Bengali labels must not receive
letter-spacing.

### Immediate opportunities versus decisions

**Immediate (no new policy, no schema, no owner input):** the overview rework, the inline COD decision with
a defaulted note, the age display and `tel:` link, the availability switch, the notice/empty/loading/error
system, the shared table/card components, product search and filter, the customer detail view with a
confirmed ban.

**Needs an owner decision (do not build in Phase 18):** delivery-charge configuration (prices, areas,
matching, migration), order detail beyond COD approval (dispatch, consignment, collection, reconciliation),
refund and cancellation recording, owner-operated customer credential reset, analytics beyond what the
order tables support, retention periods, and any captured ban/unban appeal flow.

**Explicitly not in Phase 18:** new business rules, any payment feature or gateway, schema changes, a chart
library, an animation library, and any dashboard metric that cannot be reconciled against the order tables.

### Acceptance for Phase 18

1. Every existing admin route keeps its server-side permission check; no control moves capability to the
   client. `verify:admin` stays green and grows browser coverage for the new interactions.
2. The COD decision is still guarded, idempotent by conflict and audited with actor, timestamp and reason.
3. No screen shows a metric it cannot source from the database, and no screen suggests a prepaid method.
4. `npm run typecheck`, `lint`, `check:i18n`, `build` and the browser suite pass, with the admin routes
   exercised at 360px and with keyboard only.
5. A stated, written list of what was **not** done, so the next phase is not guessed from silence.

## Analytics design direction

Analytics exists to answer business questions. A chart that answers no question is decoration and is not built.

### Questions and charts

| Business question | Chart | Notes |
| --- | --- | --- |
| How are sales changing over time? | Revenue over time, line or bar | Selectable range; comparison against the previous equal-length period |
| How many orders are pending, fulfilled or cancelled? | Order status distribution | Single stacked or grouped bar. Statuses come from the order state machine, so counts always reconcile with the order list |
| Which products and categories generate the most revenue? | Ranked bar, top N | Revenue, not unit count, is the default sort. Show the time window used |
| Which products are out of stock? | Out-of-stock table | Availability is a binary owner-controlled state (D19, ADR 0013); there is **no quantity, no threshold and no low-stock measure**, so the honest question is which products are marked out of stock |
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
