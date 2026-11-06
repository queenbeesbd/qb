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
- Brand anchors `#C8B6FF` (owner choice, 2026-11-05) and `#F6B3CC` are used deliberately, not painted over every surface. White on `#C8B6FF` is 1.81:1, so filled actions use ink on the lavender (`--color-button` / `--color-button-ink`); danger actions keep their own red.
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
| **Categories** | Create and edit; bilingual names; display order; visibility; optional image; and **one level of subcategory** (Phase 31, owner-authorized 2026-11-06). **Implemented in Phase 13** (names, descriptions, order, visibility), Phase 36 (images, editor) and Phase 31 (parent picker, list grouping, storefront hierarchy). Archiving is **refused while products or subcategories still reference the category**, rather than cascading |
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
  **Both tabs paginate since Phase 30** - the waiting list used to render every waiting order at once -
  and the tab badge still counts the whole worklist, so the owner sees how much is waiting while looking
  at one page of it.
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

### The product editor (Phase 35)

`/admin/catalog/new` and `/admin/catalog/[productId]` are their own routes. The list no longer hosts a
form, so a filtered, paginated list and a full-height editor stop sharing a URL - and a refresh cannot
lose whichever one the owner was in. `?new=1` and `?edit=<id>` are gone rather than kept as aliases.

**Layout (revised 2026-11-06 to the reference's information architecture):** the writing and the
commercial facts share the wide column - General information, Media, Pricing, Inventory and Shipping -
while the narrow column holds the live storefront preview, Category/Brand, pack size and slug, and
Publication. A sticky action bar keeps Save reachable. Below 1100px the columns stack in source order:
fields first, preview and status after.

**But not every reference field.** The form keeps this store's approved model: there is no stock
quantity (availability is a state, ADR 0013), no digital product, no rich-text description, no SEO
description, no buying/margin price, no per-product delivery charge, no product-serial/warranty
fields, no variant matrix and no custom detail fields. Those are recorded as incompatible or
owner-decision items in `docs/reference/zatiq-easy-admin-parity.md`; copying their inputs without the
data behind them would be a promise the product cannot keep. The Shipping card states the real rule -
store-wide area charges, set once in Settings - rather than an inert per-product toggle.

**What the form states that the reference does not:**

| Fact | How it is presented |
| --- | --- |
| Required fields | A summary naming the empty ones, plus a text marker on each label - not asterisks alone |
| The saving | Derived from the two typed amounts; a comparison price that is not higher is called out before save |
| The slug | The storefront path it will produce, derived live from the English name |
| The two states | One sentence for the combined outcome: live and orderable, live but not orderable, or hidden |
| A blocked submit | The missing set in text, `aria-invalid` on the fields, focus on the first offender |
| Photographs on create | Chosen with the product and saved in the same request - no "create first, return later" dead end |

**Photographs are chosen with the product.** The Media section is a dashed drop zone plus an **Add
images** button; dragging or choosing files shows their thumbnails before anything is sent, with the
first marked **Cover**, per-image remove and move controls, and a stated limit of eight. The form is
`multipart/form-data`; the server stores every file (`saveUpload`, bytes decoded and re-encoded to
WebP at 320/600/1050), creates the product, and attaches the photographs in the same order, in one
transaction. An unreadable file refuses the whole save and returns to the create page with
`imageInvalid`; a product is never created with its chosen photographs silently missing. On the edit
screen the same control adds to the gallery, appending after the existing order; alt text starts as the
product name and stays editable in the gallery below.

**Image ordering is real.** `product_image.sort_order` is written as a dense 0..n-1 sequence in one post
from move up/down buttons, with the primary image kept a separate fact: "first in the gallery" and "the
image on the card" are different, and a reorder must not silently repoint the card.

**The picker still reads the server's own inventory** for images that were already there, and every
stored image's metadata comes from its file bytes, never from the request.

### Subcategories (Phase 31)

The category editor offers a **Parent category** picker. The rule is **one level**: the picker lists
live top-level categories only, a category cannot be its own parent, a child cannot become a parent,
and a category that already has live children is **locked to the top level** with the reason stated in
the form. The service enforces all four conditions; the picker is a convenience, not the control.

- The admin list groups a child beside its parent (`parent_id NULLS FIRST` inside a parent-keyed sort)
  and labels the row **In &lt;parent&gt;**.
- The edit screen's usage card continues to show the derived **subcategory count**; archiving is still
  refused while a live child exists, and the supported order is archive the child first.
- `parentId` is audited on create and on update (before and after).
- `returnTo` still only accepts the two editor shapes; a refused parent move returns to the editor.

**Storefront.** The category index, homepage department rail, header drawer and filter rail show
**roots only**. A parent page lists its live children as real links before the grid, and its listing
includes products filed under those children, so a department does not lose stock to its own
subcategory. A child page keeps the normal listing and its breadcrumb reads
**Categories / Parent / Child**. Department counts include child products; a child's own tile count
stays its direct products. A child whose parent is hidden is shown as a root rather than becoming
unreachable.

**No schema change** - `category.parent_id` and `category_not_own_parent` already existed. Nothing is
deployed.

### The list surfaces (Phase 30)

All six admin lists - orders, the COD queue, products, categories, customers and the audit trail - share
one vocabulary, defined once and consumed everywhere:

| Part | Where | Contract |
| --- | --- | --- |
| Toolbar | `_ui/ListToolbar.tsx` | filter tabs, then search, then the date range - same order on every list |
| Search | `ListSearch` | a real `GET` form carrying the other filters and **never** the page number |
| Filter tabs | `FilterTabs` | links with `aria-current`, so every filtered view is a URL |
| Date range | `_ui/ListFilters.tsx` | two `type="date"` inputs, applied in SQL, half-open `[from, to+1 day)` |
| Active filters | `ActiveFilters` | a chip per filter in force, each with its own remove link |
| Footer | `_ui/Pagination.tsx` | the **only** count on the page, the page-size control and the pager |
| Query state | `src/lib/admin-query.ts` | pure, unit-tested parsing and URL building |

**Rules that hold everywhere:** filtering is done in SQL by the server, never in the browser over one
page; every piece of list state is in the URL, so a filtered list is linkable and survives a reload;
changing a filter or the page size drops `page`, so a narrowed list starts at page 1; and an invalid
parameter is clamped rather than refused - `?page=9999` resolves to the last page, an undocumented page
size falls back to the list default, and an impossible date such as `2026-02-31` is ignored instead of
silently rolling into March.

**The counts are derived, never stored.** Every total is a `count(*)` over the same predicate as the page
it describes, and the page-size options are `10 / 25 / 50 / 100`. The audit trail pages at 50 by default
because it is long-lived and read in longer sittings.

### The order detail and order history (Phase 20)

The queue is a **worklist**; an order also needs a **record**. Both now exist, and neither duplicates the
other's policy:

- **`/admin/orders`** (requires `order.read`): every order the store has taken, newest first, with
  server-side search over the order number, recipient name and phone, a status filter over the eight
  states the model actually uses, a **server-side date range** over `placed_at` (Phase 30), a page-size
  control, and pagination with an exact total so a list can never silently truncate. Each row also shows
  the snapshotted delivery charge as a sub-line of the total and the number of recorded lines. Rows link
  to the detail.
- **`/admin/orders/[orderNumber]`** (requires `order.read`): the reference and placement time, the
  customer and the delivery contact with a `tel:` link, the delivery area and full address, the recorded
  lines at their saved unit prices, the **delivery-charge snapshot** the order stored, the order and COD
  states, a cancelled order's reason, the **order event log**, and the **audit trail for that order** -
  the last of these only for a principal holding `audit.read`. A reference that names no order is a
  **404**, not a 403, so the page cannot be used to probe for order numbers.
- **The decision controls on the detail page are the queue's own guarded forms** (the same
  `/api/admin/orders-cod` route, the same service, the same audit). A decided order shows its decision
  and no second form.
- **The customer's account email is not sent to the browser** unless the viewer holds `customer.read`.
  Reading an order and reading a customer are different permissions, and a client component's props are
  serialized into the response - so withholding it in the view alone would still have delivered it.
- Customer detail lists that customer's orders as links into the same page, and says when the list is
  capped rather than ending silently.

### The post-approval operations (Phase 20b)

The order detail is the workspace for the life of an order. The **next legal action is the first block
under the page header**, before the money facts and the record - the owner opens an order to act on it, and
the record is what they check before acting. The band states the step, why it is offered and the order
total; a settled order shows **no band at all** rather than an empty panel. Each control appears **only
while its transition is legal**, and every one posts to a single guarded endpoint
(`/api/admin/orders/transition`) that calls a service which re-checks the action's own permission and the
order's current state.

| Control | Appears when | Records |
| --- | --- | --- |
| Mark dispatched | Approved (or legacy verified) and not yet dispatched | `status = shipped`, `shipped_at`, `order_shipped` |
| Mark delivered | Dispatched, cash still owed | `status = delivered`, `delivered_at`, `order_delivered`. **Never** cash |
| Delivery failed (reason required) | Dispatched, cash still owed | `cod_state = cod_failed` + one `customer_return` per line, `cod_failed` |
| Record the parcel back at the store | Delivery failed, a return is live | `status = returned`, returns `received`, `return_received` |
| Accept / reject after inspection | A line is `received` | `inspected_accepted` / `inspected_rejected` (+ a required note to reject), `return_inspected` |
| Record cash collected | Approved, awaiting cash | `cod_state = cod_collected`, `cod_collected`, amount due from the order row |
| Complete the order | Delivered, with cash collected or the parcel returned | `status = completed`, `completed_at`, `order_completed` |
| Cancel the order (reason required) | Not yet dispatched | `status = cancelled`, `cancelled_reason`, `order_cancelled` |

**Three things the screen states rather than does:** approval is not cash; collection is not
reconciliation; and an inspection does not make anything sellable. Returned goods become orderable again
only when the owner sets the product **In Stock** by hand, because nothing was ever deducted from a
count (ADR 0013) - so a returned parcel cannot silently reappear for sale.

**Every transition is atomic and idempotent:** the state change, its `order_event` (whose unique key
makes a second copy impossible) and its audit record commit together or not at all; a stale page or a
double click updates zero rows and reads `conflict`; a racing pair lets exactly one win.

### What the COD module does not do yet

- **No courier consignment or tracking record.** Dispatch is a state the owner records, not an API call to
  a courier, and no delivery estimate or promise is made.
- **No courier reconciliation, by design.** QueenBee's has no courier statement, so there is nothing to
  match: the owner records payment receipt personally and that is the money fact (Phase 21).
  `cod_reconciled` is written by nothing and no figure is described as reconciled.
- **No automatic retry, reship, cancel or refund.** A failed delivery records the outcome and creates the
  returns; every decision after that is the owner's. The failed delivery's charge is the **owner's cost**
  (owner decision, 2026-10-20) and is never added to the customer's total.
- **No courier data of any kind.** The owner verifies payment in the courier's own dashboard and records
  the fact here; nothing is imported, matched or inferred.

### The money figures (Phase 22, ADR 0018)

Four amounts are kept **separate on purpose**, because collapsing them is what produces a false
"revenue" number:

| Figure | What it is |
| --- | --- |
| **Customer payments** | `items_subtotal + shipping` over completed, paid orders. What customers paid - **gross**, and never called revenue |
| **Standard delivery fee** | The configured charge inside that payment, which the courier keeps |
| **Additional courier costs** | Costs the owner recorded on those orders. Voided rows are excluded |
| **Estimated net proceeds** | Customer payments **−** standard fee **−** additional costs. An estimate, and `Unavailable` when the split cannot be substantiated |

Three rules make them correct:

1. **The fee is subtracted once.** It is inside the customer payment, so netting it is not a second
   deduction; additional costs were never in the payment and are subtracted after it.
2. **Nothing is a counter.** Every figure is a `sum()` over order and cost rows on each read, so no order
   or cost can be counted twice and a void simply leaves the sum.
3. **The standard-fee equivalence is checked.** `order.shipping_minor` equals the configured fee for
   every order under the three-area model. Orders that predate it (delivery `0`, no `district_code`)
   add their gross payment but no net, and the screen states how many there are.
- No cancellation or refund workflow beyond the COD rejection, which cancels a still-pending order.
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

### Shell and overview redesign (implemented locally, 2026-10-22)

The Phase 18 shell was **replaced, not polished**. The dark rail became a **lavender wash of the
storefront canvas** with the current section in a filled action-purple pill, and the phone's off-canvas
drawer became a **fixed bottom tab bar** - Overview, COD orders, Products, All orders, More - with the
remaining destinations, the signed-in account and sign out in a modal More sheet. There is no hamburger,
because two mobile navigation models would each have to be learned and maintained.

The overview was recomposed around the queue instead of a metrics grid: a greeting as the heading (no
eyebrow, on any admin page), a lavender queue panel that states the count and the oldest wait in one
sentence, three worklist cards whose note and Accept/Reject share a full-width footer, then recorded
revenue and catalog state on the left with anything flagged or refused beside them. On a phone the order
is queue, attention, money, catalog; the bar and the safe-area inset are always reserved.

Everything the Phase 18 brief promised still holds: the queue uses the same guarded route, the audit note
is still required and open, rejection still requires a reasoned confirmation, and a settled order still
shows no action band. `verify:admin` now asserts the bottom bar and the More sheet in Chromium (modal
focus, Escape, focus restoration) and the overview's action-first layout, and remains green.

**What the brief deferred and remains unbuilt:** dispatch/consignment, cash collection and reconciliation,
refund and cancellation recording, owner-operated customer credential reset, analytics, delivery-charge
configuration, and any route-level loading skeleton (rejected in Phase 18 because it weakens the refusal
contract - see `docs/design-system.md`). The status, rather than the customer account, is still the only
place a decided COD order appears; there is no order detail page yet.

### Overview refresh (2026-11-06)

The overview was re-composed around the reference's information architecture **without** adopting the
SaaS product around it. It now reads as a shop back office:

- **Header:** greeting, one sentence of context, **View storefront** and **Add product**. There is no
  plan/subscription banner, no marketing hero, no "visit website / copy" promo card and no upgrade
  prompt - this shop is not a hosted store builder.
- **Queue first, still.** The COD worklist stays above the figures (Phase 18's rule), with its count,
  oldest wait, cards and decisions unchanged.
- **KPI tiles:** **Revenue today**, **Orders today**, **Active products**, **Total customers** and
  **Waiting on a call**. Each tile states the day's fact and the 30-day context in its note; the
  revenue tile carries the sparkline and the waiting tile is the only warning surface. The figures are
  derived on read (`loadToday`, `countCatalog`, `countCustomers`, `codQueue`), never counters.
- **Charts:** the revenue panel now carries **average per day**, **peak day** and **items sold** above
  the area chart; the order-status ring is unchanged. Both are the same hand-drawn SVG (ADR 0021 D5).
- **Recent orders:** guest orders are included (left join; an inner join hid them), with an initials
  avatar and the guest fallback instead of an invented customer.
- **Closing panels:** **Out of stock** (published products the owner marked unavailable - a state,
  never a stock number), **Top selling** (real ordered units on completed, paid orders), and **Quick
  actions** (Add product, COD orders, Categories, Promo codes, Delivery charges, Analytics). Each
  action is gated by the permission that already protects its destination.

**Deliberately absent:** website visits/traffic (nothing is tracked), low stock (there is no quantity),
themes/builder/app/marketplace/vendor links, a "new order" button (orders come from customers), and
subscription/renewal/upgrade prompts. See the rule in `AGENTS.md`.

**Verification (2026-11-06, local):** typecheck, lint (0 errors), `check:i18n`, unit **212/212**,
`tests/db/admin-orders.test.ts` **12/12** (including the guest recent-order case), `build`,
`verify:admin` **203/206** (the three pre-existing failures: category-visibility hydration race,
Telegram removal-dialog flake, absent CSP; the new overview-composition check passes), and Chromium at 1280 and 390 (five tiles, three closing
panels, six quick actions, zero horizontal overflow; 2-column KPI grid with the fifth tile full width
on the phone).

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

## Analytics - implemented (Phase 38, ADR 0021)

The direction below was a brief; this is what shipped. It is recorded here so the next change starts from
the real surface rather than from the plan.

**Two screens, one loader.** `/admin` (last 30 days) and `/admin/analytics` (7 / 30 / 90 days) both read
`src/server/analytics/read.ts`, so the same thirty days cannot be reported two ways.

| Question | Shipped as | Note |
| --- | --- | --- |
| How much came in? | Revenue KPI, completed and paid orders only | Gross payments are never called revenue on their own |
| How is it moving? | Revenue line, one point per day | Filled by the database so empty days are real; the peak day is stated in numbers |
| What is in the pipeline? | Order-status ring, plus the status legend with counts and shares | Bucketed by `placed_at` - workload, not money |
| What sold? | Top products by units, with revenue beside it | Units first because that is what the shelf records; revenue is the second column |
| What did it cost me? | Money panel: customer payments, the delivery fee inside them, extra courier costs, estimated net | The fee is subtracted exactly once; net is labelled an estimate |
| Did a code work? | Promo panel: uses, distinct codes, money given away | Redemption rows, never a counter |
| Who visits? | **Nothing** | No tracker exists. The screen says so in one line |

**Periods** are links, not a client control: `?period=7|30|90`, validated against the fixed set, so a
crafted value cannot ask for an unbounded scan and the back button works.

**States.** Empty is designed: the revenue figure draws a sentence rather than a line at zero, the ring
says no orders were placed, and the money panel reads "Not available" for an average with nothing to
average. There is no loading skeleton: the admin tree is `force-dynamic` and a route-level `loading.tsx`
was rejected earlier because streaming turns a refused page into a 200 shell.

**Aliases, not comparisons.** A period-over-period comparison was in the brief and is **not** shipped: it
needs a second query window, and no screen currently has a place to state both windows without inviting a
"trending up" reading the data cannot support. It stays a future decision.

## Analytics design direction (the original brief, kept for context)

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

## Owner decisions

These block specific, named features. None was guessed; the features they block are simply not built.

| # | Question | What it blocks |
| --- | --- | --- |
| 1 | ~~**Who bears the delivery charge when a delivery fails?**~~ **Settled 2026-10-20: the owner bears it**, and no failed-delivery fee is added to the customer | Nothing - the implementation follows the decision: no charge is added or waived on the order |
| 2 | ~~**What does reconciliation compare?**~~ **Withdrawn:** there is no courier statement and no settlement matching in this business | Nothing - the workflow does not exist, and none should be built |
| 3 | ~~**When does the owner record cash?**~~ **Settled 2026-10-20:** when the payment is actually received, and that same action completes the order | Nothing - implemented as one owner action behind `cod.confirm_collection` |
| 5 | **The delivery amounts** for Other districts, Dhaka and Chattogram | Every order: checkout correctly refuses until the required default is saved |
| 6 | **Photography rights** in writing | Public launch. The images are tagged pending confirmation and are not cleared |

## Open questions for the owner

1. Which modules are genuinely needed on launch day versus after trading begins?
2. Who will operate the dashboard, and what roles are required?
3. Is order fulfilment handled by staff, by courier pickup, or both?
4. Are refunds and cancellations handled in the dashboard, or by exception outside it?
