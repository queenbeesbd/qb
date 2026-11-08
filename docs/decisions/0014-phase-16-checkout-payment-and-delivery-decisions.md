# ADR 0014 - Phase 16 checkout, manual payment verification and delivery-charge decisions

- Status: accepted (owner-decided, 2026-10-16)
- Extends: ADR 0009 (bans, owner-only administration, log separation), ADR 0012 (customer
  authentication and the absence of self-service recovery) and ADR 0013 (availability is the only
  ordering gate).
- Settles: the Phase 16 checkout, payment-verification and delivery-charge questions the owner has
  answered.
- Related: `docs/payment-workflow.md`, `docs/data-model.md` sections 7, 8, 9, 11 and 12,
  `docs/security.md`, `docs/requirements.md`, `docs/implementation-plan.md` (Phases 15-16).

## Context

Phase 15 (implemented locally, not deployed) created real customer accounts and **server-authoritative
atomic order creation**, but it stopped deliberately short of the money and delivery loop. Its order
creation writes a prepaid order in `payment_state = 'awaiting_payment'`, sets
`expires_at = placed_at + 24 hours`, and **collects no payment claim** - there is no
`payment_claim` row and no route that could create one. COD orders are created in
`cod_state = 'cod_pending_approval'`, but there is no owner confirmation queue, no payment
instructions, no verification queue, no delivery charge and no expiry job.

The Phase 15 report recorded those gaps, and `docs/implementation-plan.md` lists Phase 16's
operational inputs as **"recipient accounts, notification channels, reconciliation cadence, and
sufficient-evidence definition"**. The owner has now answered the checkout, payment and
delivery-charge questions and confirmed that expiry and external notifications are **not** launch
priorities. This ADR records those answers, marks the deferred and still-required items, and records
the order-state review that Phase 16 implementation depends on.

Two settled decisions frame everything below and are **not** reopened here: **D19/ADR 0013**
(availability is the only ordering gate; overselling is accepted) and **D17/ADR 0012** (first-party
customer sessions; no self-service recovery at launch).

**This ADR is a decision record and an inspection. It implements nothing.**

## Part 1 - Confirmed owner decisions

### 1. Checkout presents three payment methods

A customer adds products to the cart, continues to checkout, and chooses exactly one of **Cash on
Delivery (COD)**, **bKash**, or **Nagad**. Both prepaid methods share one flow shape; COD is a
**distinct method with its own confirmation path** and is never routed through the prepaid
verification queue (D7, unchanged).

### 2. COD: owner confirmation before processing

- The customer provides the delivery address and places the order.
- The order enters an **owner-confirmation queue**.
- The owner **calls the customer** and **manually accepts or rejects** the order before processing.
- **No automatic COD approval.**
- **No courier API integration** - dispatch stays manual. (D6 remains open; nothing here authorizes a
  courier provider.)

The owner reached the customer by phone in this decision. Any further COD operational detail - the
call script, the retry cadence for an unreachable customer, and what happens to a COD order whose
customer cannot be reached - is listed in **Part 5** rather than invented here.

### 3. bKash and Nagad: claim submission then owner verification

- The storefront displays the **configured recipient number** and the **exact payable amount**.
- The customer sends the payment externally, then supplies their **sending number**, **transaction
  reference**, and **delivery address** before submitting the order.
- The order enters the **admin payment-verification queue**.
- The owner checks the claim against the payment received and decides whether it is **verified**,
  **held for investigation**, or **rejected**.

The customer never supplies a total the server trusts (decision 4), and no value the customer sends
can mark a payment verified (unchanged: a customer-submitted reference is **never** proof of payment).

### 4. Prices and totals are computed server-side

Prices and the payable total are calculated **server-side** from authoritative product prices, cart
contents, and applicable delivery charges. **A customer-submitted total is never trusted.**

This restates the existing architecture (`docs/payment-workflow.md` section 5,
`src/server/orders/create.ts`) and is the reason the claim form carries no price field: the amount
the customer is asked to send is derived and displayed, not accepted.

### 5. The admin order view shows the payment method and the verification evidence

The chosen payment method is displayed clearly in the admin order view. For a **prepaid** claim, the
view shows, as needed for verification:

- the sender number,
- the transaction reference,
- the claimed amount,
- the order total (the expected amount),
- the configured recipient,
- and the delivery address.

### 6. An amount mismatch allows a hold - it does not decide the outcome

If the claimed amount does not match the expected amount, the owner may **hold the order for manual
investigation or confirmation**. The system does **not** automatically approve or reject based solely
on the mismatch. A mismatch is a reason to look, not a verdict.

### 7. Rejection is distinct from a confirmed false claim

- **Ordinary rejection** (`rejected`) means receipt could **not be confirmed**. A delayed transaction
  or a mistyped reference is **not** fraud and produces `rejected`, not an accusation.
- **A confirmed false claim** (`falsely_claimed`) is a separate, explicit finding that requires a
  **reason** and an **audit record** with an actor.
- **Customer flagging and banning are separate owner decisions.** A customer is **never automatically
  banned** because a claim was rejected or mismatched.

This preserves the existing rule that only `falsely_claimed` may support a customer flag, and that a
flag blocks nothing while a ban does (D20, ADR 0009).

### 8. Customer bans are manageable, reasoned, audited and enforced

A customer ban must:

- be **manageable in the admin panel**,
- **require a reason**,
- be **audited** (actor, timestamp, reason),
- **revoke active customer sessions**, and
- **prevent future sessions and order attempts**,

and must **not** automatically cancel or refund existing orders.

The service primitive for this already exists (`suspendCustomer` in
`src/server/customer-auth/service.ts`: guarded `active -> suspended`, reason of 10-500 characters,
all live sessions revoked with `admin_revoke`, an append-only `customer.banned` audit record), and
the order path already refuses a suspended account **inside its own transaction**. What does **not**
exist is the **owner-facing admin control** that calls it. That is a Phase 16 implementation item, not
a new policy.

### 9. Customer password reset is a confirmed product requirement, deferred for implementation

Customers **should be able to reset their own passwords**. This is a confirmed requirement, and it is
**explicitly not implemented by this ADR** and **not implemented in Phase 16's checkout work**.

Stated constraints, unchanged from ADR 0012 and stated here so the gap is not mistaken for an
oversight:

- **No mail, SMS or other external delivery provider is authorized.** Self-service reset therefore
  cannot ship until a delivery channel is approved and configured. **Do not invent a working email
  provider and do not ship a nonfunctional reset flow.**
- The delivered mechanism must be **secure and auditable**: a single-use token, stored only as a
  **hash**, with a **short expiry**, **request throttling**, **session revocation** on successful
  reset, and an **audit record** - the same shape the owner-issued staff recovery already uses.

**Existing recovery schema (inspected).** `account_recovery_token` already exists
(`src/db/schema/identity.ts`): `id` uuid, `customer_id`, `purpose` (`password_reset` |
`email_verify`), `token_hash`, `created_at`, `expires_at`, `used_at`, `requested_ip_hash`,
with a unique `token_hash`, a partial unique `(customer_id, purpose) WHERE used_at IS NULL`, and the
purpose CHECK. **This table is sufficient for secure, auditable self-service recovery as designed; no
schema change is required by this ADR.** What is missing is the delivery channel, the endpoints, the
throttle wiring, and an authorization decision about who may trigger a reset - none of which are in
scope here.

### 10. Delivery charges are owner-configured, with historical snapshots

Delivery charges are configurable by the owner in admin settings and must:

- support a **site-wide default**, and
- support **specific delivery areas** with their own configured charges;
- define **deterministic matching and fallback only if existing decisions or code support it** -
  otherwise the matching policy is an **open decision** (see Part 4);
- preserve the **original delivery-charge snapshot on historical orders** when settings change;
- have **owner-authorized, audited** settings writes (the existing `settings.write` /
  `updated_by_staff_id` model).

**Required owner values are outstanding configuration.** This ADR invents **no** delivery price,
number, label, area or courier arrangement.

### 11. Expiry is not a launch priority

- A **24-hour automatic order-expiry timer is not a launch priority**. **No scheduler, cron, job
  runner or expiry infrastructure is added now.**
- **A submitted payment claim awaiting owner review must not expire automatically.**
- Any existing expiry behaviour that conflicts with this is documented in **Part 4** with the smallest
  safe resolution. (No expiry sweep is implemented today, so the conflict is latent rather than
  active - but the schema and one code path assume the sweep exists, and that assumption is what the
  resolution addresses.)

### 12. External notifications are not required now

**No email, SMS, WhatsApp, Telegram or notification-provider integration is added now.** The customer
checks order status on the site, and the owner works the admin queue. The existing
`customer_notification` table (`in_app` channel) is implemented and **unused**; whether a minimal
in-app status/queue surface is part of Phase 16 is an implementation-scope question, not a provider
question. No provider is authorized.

### 13. Payment, COD and moderation decisions are audited

Recorded with **actor, timestamp, prior state, decision, and reason where required**:

- payment decisions (verify, hold, reject, false claim),
- COD acceptance and rejection,
- false-claim findings,
- customer flags, and
- bans.

The append-only `audit_event` store and `recordAudit` already exist. **Phase 16 must extend its
closed `AuditAction` union** (`src/server/auth/audit.ts`) with the new payment, COD and moderation
actions; that is a code change with **no schema migration** - `audit_event.action` is free text with a
non-empty CHECK, and actor/before/after/reason are already present.

### 14. Data minimization; no oversized retention subsystem

- Collect only what is needed for **orders, payment verification, customer support, and security**.
- **Never store payment PINs, OTPs, passwords, or unnecessary payment credentials.** The approved
  claim fields (sender number, transaction reference, claimed amount) are the whole set; a screenshot
  is still not requested, not collected and not stored (D8).
- Keep **business/customer activity records separate from internal security logs**, distinguishable by
  construction: denials carry `admin.action_denied` and a category, and a customer is never an audit
  actor type (D23, ADR 0009).
- **Do not build a retention subsystem for this phase.** Retention that is not yet legally or
  operationally settled is listed as an open decision, not implemented speculatively.

### 15. Do not invent retention periods

Any unresolved **legal, operational or data-retention** question is recorded as an **open decision**
(Part 4). An unknown retention period must **not** block prepaid checkout.

## Part 2 - Deferred decisions (recorded, not implemented)

These are **not** implemented by this ADR and **not** part of the narrowly scoped Phase 16 checkout
work:

| Deferred | Status and reason |
| --- | --- |
| 24-hour automatic order-expiry timer, scheduler or job runner | Owner: not a launch priority. No scheduler infrastructure is added. D16 stays open. |
| Email / SMS / WhatsApp / Telegram / push notifications | Owner: not required now. No provider is authorized. |
| Automated payment gateway, webhooks, auto-confirmation, auto-refunds | Not authorized (D7). ADR 0014 changes nothing here. |
| Self-service password reset implementation | Confirmed requirement, deferred. Blocked on an authorized delivery channel. |
| Courier API integration | Not authorized; dispatch stays manual. D6 stays open. |
| Customer flags beyond the review flag | `customer_flag.type` is `review` only. A second flag type is a new owner decision and a migration. |
| Removing the unused inventory tables | A migration and a separate decision (ADR 0013 open question). Not touched. |
| Any new fraud-scoring, risk engine or automatic ban | Not authorized. Flags and bans stay explicit, reasoned owner actions. |

## Part 3 - Order-state review (inspected, not changed)

### 3.1 Concern separation is already structural

The schema keeps **eight separate state concepts** in separate columns or tables. **None may be read as
a proxy for another**, and Phase 16 must not collapse any of them:

| # | Concern | Where it lives | Values |
| --- | --- | --- | --- |
| 1 | Order fulfilment / owner acceptance | `order.status` | `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `completed`, `cancelled`, `returned` |
| 2 | Prepaid payment claim verification | `order.payment_state` | `awaiting_payment`, `awaiting_verification`, `verified`, `rejected`, `falsely_claimed`, `expired`, `not_applicable` |
| 3 | COD owner confirmation and cash | `order.cod_state` | `not_applicable`, `cod_pending_approval`, `cod_approved`, `cod_collected`, `cod_failed`, `cod_reconciled` |
| 4 | Claim record (what was claimed, by whom, resolved how) | `payment_claim.state` | `submitted`, `verified`, `rejected`, `falsely_claimed`, `withdrawn` |
| 5 | Refund lifecycle | `refund.state` (separate table) | `requested`, `processing`, `completed`, `failed` |
| 6 | Inventory reservation | `stock_reservation.state` | `held`, `consumed`, `released` - **implemented and unused (ADR 0013)** |
| 7 | Customer review flag | `customer_flag.state` / `.type` | `raised`, `cleared` / `review` |
| 8 | Account standing (ban) | `customer.status` | `active`, `suspended`, `deleted` |

**A note the review found.** The payment claim carries **no `order_item` link** in the implemented
schema (`payment_claim.order_id` only). The Phase 10 design's per-unit claim bound (D11) therefore has
no unit to attach to, which is consistent with ADR 0013 (no reservation, so no unit) but means the
per-item foreign key shown in the design's entity diagram is **not** implemented. Phase 16 must decide
the claim's granularity from this fact, not from the diagram.

### 3.2 Transitions Phase 16 must represent

For each transition: prior state -> resulting state, actor, evidence/reason, audit event, idempotency,
and the concurrency guard. Names below are from the **implemented** schema; anything requiring a new
value is flagged.

**A. Order fulfilment and owner acceptance (`order.status`)**

| Prior -> Result | Actor | Evidence / reason | Audit (`order_event`) | Idempotent | Concurrency guard |
| --- | --- | --- | --- | --- | --- |
| - -> `pending` | System | Order created (Phase 15) | `order_placed` | Yes (idempotency key) | Idempotency key unique; replay returns original |
| `pending` -> `confirmed` | Owner | Prepaid: `payment_state='verified'`; COD: `cod_state='cod_approved'` | `order_confirmed` | Yes | Guarded `UPDATE ... WHERE status='pending'` |
| `confirmed` -> `processing` | Owner | Confirmed | `order_processing` | Yes | Guarded on current state |
| `processing` -> `shipped` | Owner | Prepaid verified, or COD approved; consignment recorded manually | `order_shipped` | Yes | Guarded; **no reservation to consume (ADR 0013)** |
| `shipped` -> `delivered` | Owner | Delivery recorded; touches no money | `order_delivered` | Yes | Guarded |
| `delivered` -> `completed` | Owner | COD: cash state already `cod_collected`/`cod_failed` | `order_completed` | Yes | Guarded |
| `pending`/`confirmed`/`processing` -> `cancelled` | Owner | Approved cancellation, reason required | `order_cancelled` | Yes | Guarded; **no reservation to release** |
| `shipped`/`delivered` -> `returned` | Owner | A `customer_return` reached `received` | `return_received` | Yes | Guarded |

Forbidden: dispatch without payment verification or COD approval; any customer-caused fulfilment
transition; any transition on a terminal order.

**B. Prepaid claim and verification (`payment_claim.state`, mirrored into `order.payment_state`)**

| Prior -> Result | Actor | Evidence / reason | Audit | Idempotent | Concurrency guard |
| --- | --- | --- | --- | --- | --- |
| - -> `submitted` | Customer (own order) or owner recording a phone claim | Order in `awaiting_payment`; server-computed amount on screen; sender + reference + address supplied; **no other active submitted claim for this order** | `claim_submitted` | Yes (`claim_submit` idempotency key) | Partial unique `payment_claim_active_unique` on `order_id WHERE state='submitted'`; guarded order update |
| `submitted` -> `verified` | Owner only | Receipt independently confirmed via the payment account; `verified_amount_minor` recorded; mismatch explicitly acknowledged | `payment_verified` | Yes | Guarded on `state='submitted'`; `CHECK` requires actor + amount |
| `submitted` -> **held** | Owner only | Amount mismatch or unclear evidence; reason recorded | a hold event (see gap below) | Yes | **Needs a representation - see the gap note** |
| `submitted` -> `rejected` | Owner only | Receipt not confirmed; reason >= 10 characters | `payment_rejected` | Yes | `CHECK` requires actor + reason |
| `submitted` -> `falsely_claimed` | Owner only | **Confirmed** false claim; reason >= 10 characters | `payment_falsely_claimed` | Yes | `CHECK` requires actor + reason |
| `submitted` -> `withdrawn` | Customer (own claim) or owner | Claim still `submitted` | `claim_withdrawn` | Yes | Guarded; order returns to `awaiting_payment` |

Forbidden: a customer-caused `verified`; `verified` without an owner actor and amount; `rejected` or
`falsely_claimed` without actor and reason; a second concurrent `submitted` claim for one order.

**Gap note - the "held" decision has no state today.** `CLAIM_STATE` and `PAYMENT_STATE` have **no
`held` value**. Requirement 6 needs a representable hold. Two honest options, **neither chosen here**:

1. **Represent the hold as an open `operational_exception` of type `payment_mismatch`** while the
   claim stays `submitted`. **No schema change** - the table and the `payment_mismatch` type already
   exist, and the partial unique `(type, subject_key)` prevents duplicate holds for the same subject.
   The claim remains in the queue and cannot expire; the owner records the eventual decision normally.
2. **Add a `held` value to `CLAIM_STATE` and `order.payment_state`.** This is a **migration**
   (two `CHECK` constraints) and a policy-visible new state, and it must not be added until the owner
   chooses it.

**Recommendation, not a decision:** option 1 is the smaller change and keeps the claim in one state
while an investigation is open. It is recorded as an implementation choice for the owner to confirm,
because it slightly changes what the queue means ("submitted with an open mismatch exception").

**C. COD owner confirmation (`order.cod_state`)**

| Prior -> Result | Actor | Evidence / reason | Audit | Idempotent | Concurrency guard |
| --- | --- | --- | --- | --- | --- |
| - -> `cod_pending_approval` | System | Order created with `payment_method='cod'` | `order_placed` | Yes | Idempotency key; COD has no payment claim |
| `cod_pending_approval` -> `cod_approved` | Owner only | **Owner reached the customer by phone** and accepts | `cod_approved` | Yes | Guarded `UPDATE ... WHERE cod_state='cod_pending_approval'` |
| `cod_pending_approval` -> rejected | Owner only | Owner rejects after the call; reason recorded | `order_cancelled` (or a dedicated event) | Yes | Guarded; **ends the COD order, not the customer** |
| `cod_approved` -> `cod_collected` | Owner only | **Cash physically collected**; delivery evidence recorded | `cod_collected` | Yes | Guarded; never on approval or dispatch |
| `cod_approved` -> `cod_failed` | Owner only | Delivery failed or refused; a `customer_return` is created | `cod_failed` | Yes | Guarded |
| `cod_collected`/`cod_failed` -> `cod_reconciled` | Owner only | Courier statement matched | `cod_reconciled` | Yes | Guarded; reconciliation is separate from collection |

Forbidden: any `cod_collected` before real collection; `cod_approved` without an owner actor;
dispatch while `cod_state='cod_pending_approval'`; routing a COD order through the prepaid claim queue.

**Note.** `cod_pending_approval -> not_applicable` exists in the schema's CHECK set as the
"cancelled before approval" path. Whether a **rejected** COD order cancels the order
(`order.status='cancelled'`) or only declines the COD plan is an **open operational question** (Part
4); the schema can express either, and no row may be written until the owner decides.

**D. Refund lifecycle (already supported: `refund` table, `refund.state`)**

| Prior -> Result | Actor | Evidence / reason | Audit | Idempotent | Concurrency guard |
| --- | --- | --- | --- | --- | --- |
| - -> `requested` | Customer via support, or owner | Amount > 0 | `refund_requested` | No natural key - **use an idempotency key** | Amount check inside the transaction |
| `requested` -> `processing` | Owner | Accepted for handling | `refund_processing` | Yes | Guarded on current state |
| `processing` -> `completed` | Owner | `evidence_note` + actor required by `CHECK` | `refund_completed` | Yes | Guarded |
| `processing`/`requested` -> `failed` | Owner | `failure_reason` required | `refund_failed` | Yes | Guarded |

`refund.state` never reads or writes `order.status`, `order.payment_state`,
`stock_reservation.state` or `inventory_balance`. **A refund is never reported completed because it
was requested or approved.** No refund state is in scope for the narrow Phase 16 checkout work.

**E. Customer flag and ban (already supported: `customer_flag`, `customer.status`)**

| Prior -> Result | Actor | Evidence / reason | Audit | Idempotent | Concurrency guard |
| --- | --- | --- | --- | --- | --- |
| - -> flag `raised` | Owner only | A **confirmed** finding; reason >= 10 characters; `raised_by_staff_id` NOT NULL | `customer.flagged` (to add) | Yes | Partial unique `customer_flag_live_unique` on `customer_id WHERE state='raised'` |
| `raised` -> `cleared` | Owner only | Reason + actor | `customer.flag_cleared` (to add) | Yes | Guarded |
| `active` -> `suspended` | Owner only | **Confirmed fake order**; reason 10-500 chars | `customer.banned` (**exists**) | Yes (second ban is a conflict) | Guarded on `status='active'`; revokes all live sessions |
| `suspended` -> `active` | Owner only | Reversal, reason required | `customer.unbanned` (to add) | Yes | Guarded |

**A ban never cancels, refunds or deletes an order, and touches no payment, refund or reservation
state.** A flag blocks nothing. Neither is ever raised automatically.

### 3.3 How the intended checkout maps to the current implementation

**Current Phase 15 behaviour (inspected, not changed):**

1. Cart line ids and quantities are parsed; duplicate ids merged and quantities clamped.
2. Orderability is checked per product from database state - **availability is the only gate**
   (ADR 0013).
3. Prices are read from `product_variant.price_minor` **inside the transaction**; the client sends no
   price.
4. `shippingMinor` is hardcoded to **0** with a comment that delivery charges are not approved, so
   `totalMinor = subtotal`.
5. A prepaid order is written as `payment_state='awaiting_payment'`, `expires_at = placed_at + 24h`;
   a COD order as `cod_state='cod_pending_approval'`, `expires_at = NULL`.
6. **No `payment_claim` row is written and no payment-instructions step exists.**

**What the intended flow needs mapped onto that:**

| Intended flow | Current model | Minimal change required |
| --- | --- | --- |
| Choose COD / bKash / Nagad at checkout | `payment_method` already carries all three; COD already starts `cod_pending_approval` | **None** to the method model |
| Prepaid: show recipient + amount, then collect sender/reference/address | Recipient config exists (`payment_recipient`); claim table exists; **no instructions step and no claim write** | Add the instructions step and a **claim submission inside the order-creation transaction**, writing one `payment_claim` row and moving the order to `awaiting_verification` |
| Prepaid order enters the verification queue | Partial index `order_verification_queue_idx` already exists | Add the owner queue read + verify/hold/reject actions |
| **A submitted claim must never expire** | `expires_at` is set at creation; **no expiry job exists**; there is no guard excluding a claimed order | **Make "never expires" structural**, not merely unscheduled: the Phase 16 claim-submission transaction must move the order to `awaiting_verification` and **clear `expires_at`** (the design's rule), and no expiry writer may ever target an order with a claim. Because no scheduler is added, the column is inert - but the ordering must still be correct |
| COD enters the owner-confirmation queue | Partial index `order_cod_queue_idx` already exists; no queue | Add the owner COD queue + `cod_approved` action |
| Delivery charges in the total | `shippingMinor` hardcoded 0; `order.total_minor = subtotal + shipping` CHECK | **Blocked on owner values and an area-charge representation** (Part 4). The snapshot column `shipping_minor` already exists and is the historical snapshot |
| Admin order view shows method + verification evidence | No admin order surface | Add the read view; no schema change |
| Owner-facing ban control | Service primitive exists, no UI | Add the admin control; no schema change |

**A corrected risk in the current code's assumption.** Phase 15 writes `awaiting_payment` with a
24-hour `expires_at`, and the design's expiry rule is "no submitted claim has *ever* been submitted".
Because Phase 15 collects no claim, **every prepaid order is currently a claim-less `awaiting_payment`
order** and would be the first thing an expiry job targeted. The safe resolution is **not** to build the
expiry job and **not** to weaken the rule, but to ensure the Phase 16 claim path is what makes the
order non-expirable: **the claim row and the state transition happen together**, and the expiry
predicate (if it is ever written) requires `not exists (payment_claim for this order)`. No expiry
writer may be added before that predicate exists.

## Part 4 - Conflicting documentation and smallest safe resolutions

The following are corrected in this change (documentation only; no code, schema or migration):

1. **`docs/payment-workflow.md` and `docs/qbpanel-dashboard.md` refer to `order.payment_status` and
   `order.refund_status`.** Neither exists. The implemented names are `order.payment_state` and the
   separate `refund` table with `refund.state`. Corrected to the implemented names.
2. **`docs/payment-workflow.md` lists the `cod_*` values inside the payment enum.** They live in
   `order.cod_state`. Corrected to say so, matching the design's own section 1.4 note.
3. **`docs/payment-workflow.md` describes reservation release, held stock and "available =
   on_hand - reserved" as operative.** Under ADR 0013 no reservation is written at order creation and
   the inventory tables are unused. Corrected with an explicit note that these mechanics are
   **unused at launch**, while keeping the historical design narrative scoped as design.
4. **`docs/payment-workflow.md` and `docs/data-model.md` describe the 24-hour expiry as an approved,
   scheduled system transition.** The owner's current position is that expiry is **not a launch
   priority and no scheduler is added**. Corrected to record the deferred status and the
   "a submitted claim never expires" rule as the binding part.
5. **`docs/data-model.md` section 12.1/12.2 reservation and stock-allocation transaction steps** are
   already marked superseded by ADR 0013; the parenthetical "(12.2)" claim-allocation wording in
   section 11.2 is corrected to match (no unit is allocated).
6. **`docs/data-model.md` states section 11.1 moves a reservation on dispatch and cancellation.**
   Under ADR 0013 there is no reservation to move. Corrected with an inline note.
7. **The design's entity diagram links `ORDER_ITEM` to `PAYMENT_CLAIM` ("covered_by") and
   `PRODUCT_VARIANT` to `STOCK_RESERVATION`.** The implemented claim has no `order_item` link, and no
   reservation is written. Corrected in place with a note that these are unused design relations.
8. **`docs/data-model.md` and `docs/platform-architecture.md` name a `shipping_zone` /
   `shipping_rate` table.** It does not exist and is deliberately not created. Corrected to say the
   area-charge representation is a **required minimum migration**, not an existing table (Part 5).

## Part 5 - Remaining owner inputs and open decisions

These are **required before the corresponding Phase 16 work is implemented**, and none of them should
be guessed:

1. **bKash and Nagad recipient numbers and customer-facing labels.** The `payment_recipient` table
   exists (one active recipient per method, format-checked); the actual numbers, account labels and
   the customer-facing instruction wording are owner values. Nothing is hardcoded.
2. **Real delivery prices and supported areas.** The site-wide default and each area's charge.
3. **Area-matching and fallback policy.** How a customer's typed area matches a configured area
   (exact match, normalized match, a picklist rather than free text) and what charge applies on no
   match. The schema has only `order_contact.area` (free text) and a flat `store_setting`; **no
   existing decision or code defines matching**, so this is an **open decision**, not an engineering
   default. If the owner wants area-specific charges, the **minimum migration** is a new
   area/charge table (one row per area with its own charge, plus the site-wide default), referenced
   by a settings-controlled key; it is **not created here**.
4. **Payment verification operational detail:** what counts as sufficient evidence of receipt for
   verification, the reconciliation cadence against the payment statement, and whether a mismatch
   hold is represented as an open `payment_mismatch` exception (no migration) or as a new `held`
   claim/payment state (a migration). See Part 3.2 gap note.
5. **Secure password-recovery delivery configuration and prerequisites:** an authorized delivery
   channel (or an explicitly owner-operated alternative), the token lifetime, and the retention rule
   for used tokens. **No provider is currently authorized**, so "customers reset their own passwords"
   cannot ship until this is answered; the schema already supports the token.
6. **Genuinely necessary COD operational detail beyond the confirmed phone-call flow:** the retry
   cadence when the customer cannot be reached, and whether a rejected COD order is **cancelled** or
   merely has its COD plan declined.
7. **Retention periods for payment claims, customer records and audit rows.** Unresolved legal /
   operational questions; recorded, **not blocking prepaid checkout**.

Already answered and **not** requested again: the three payment methods, the COD phone-call
confirmation, the prepaid claim fields, the admin evidence fields, the mismatch-hold behaviour, the
rejection-versus-false-claim distinction, the ban requirements, the deferred expiry and the deferred
external notifications.

## Consequences

- **The Phase 16 checkout, payment-verification and moderation rules are recorded** and can be
  implemented against the existing schema for the checkout/claim/queue path.
- **Delivery charges are confirmed as a requirement but are not implementable yet**: they need owner
  values **and** a migration to represent area-specific charges, which this ADR does not create.
- **Expiry and notifications are recorded as deferred**, so prepaid checkout is not blocked by them.
- **The order model is unchanged.** No migration, no state value and no table is added or removed.
  Where a representation gap exists (the mismatch hold), it is named rather than improvised.
- **The stale field names and the reservation/expiry claims across the documentation are corrected
  in the same change**, so a reader is not told that `order.payment_status` or a live reservation
  exists.
- **Customer password reset is a confirmed requirement with a stated prerequisite**, not a shipped
  feature and not a silently broken flow.

## Alternatives considered

- **Build the 24-hour expiry sweep now, as Phase 10 designed it.** Rejected: the owner has said expiry
  is not a launch priority, and adding a scheduler for an unlaunched capability is infrastructure
  without a demonstrated need.
- **Add a `held` state to the payment/claim enums now.** Rejected for this ADR: it is a migration and
  a policy-visible state, and an open `payment_mismatch` exception may represent the hold without
  changing the schema. The owner decides which is wanted.
- **Create `shipping_zone` / `shipping_rate` tables and a default charge now.** Rejected: the amounts
  and the matching policy are owner facts that do not exist yet; a table would imply a pricing model
  nobody approved. The requirement is recorded and the migration is described, not built.
- **Add an in-app notification fan-out now so the customer "gets told".** Rejected: not required now;
  the customer checks order status on the site. The unused `customer_notification` table stays.
- **Ship self-service password reset with a placeholder mail path.** Rejected outright: the honesty
  rules forbid offering a recovery path that does not work, and no mail provider is authorized.

## What this does not authorize

No schema change, migration, state-value change, table creation or removal; no checkout, payment,
verification, delivery, ban-control or reset implementation; no scheduler, cron, queue or job runner;
no notification provider; no courier integration; no automated gateway, webhook or auto-refund; no
provisioning, deployment, DNS or credential change. **Nothing is implemented by this ADR.**
