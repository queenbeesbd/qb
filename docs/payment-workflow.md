# Payment workflow - Cash on Delivery

Status: **rewritten 2026-10-17 for the COD-only release (ADR 0015)**. Supersedes the manual mobile
financial service verification design of 2026-10-11/2026-10-16, which is retained below from §2 onward
as **historical design**, not as behaviour. Companion documents: `docs/decisions/0015-cod-only-release.md`
(this release), `docs/decisions/0014-phase-16-checkout-payment-and-delivery-decisions.md` (the COD
decisions and the deferred items), `docs/security.md`, `docs/admin-dashboard.md`, and
`docs/implementation-plan.md` (Phase 17).

> **Read this first.** This release accepts **Cash on Delivery only**. There is **no** prepaid method, no
> payment instructions, no sender number, no transaction reference, no claimed amount, no recipient
> account, no verification queue and no `payment.*` permission in the application. Those were built in
> Phase 16 and **removed in Phase 17**. References to them below are history.

## 1. The current payment model

QueenBee's accepts **one** method: **Cash on Delivery**. Ordering still requires a customer account
(D12), and the customer pays the courier when the parcel arrives.

| Fact | Where it lives | Notes |
| --- | --- | --- |
| Method | `order.payment_method = 'cod'` | Not a request field: `createOrder` takes no method, so a submission cannot choose one |
| Prepaid state | `order.payment_state = 'not_applicable'` | The schema's pairing constraint means a COD order cannot carry a prepaid state |
| COD state | `order.cod_state = 'cod_pending_approval'` | The owner's decision moves it to `cod_approved` |
| Expiry | `order.expires_at = NULL` | There is no prepaid payment to expire and **no expiry writer exists** |
| Total | `order.total_minor` | Server-computed from `product_variant.price_minor`; delivery is `0` because no charge is configured |

### The customer journey

1. Add available products to the cart and sign in (or register) at checkout.
2. Enter delivery contact details. The page states that this release is cash on delivery and that
   nothing is paid online.
3. Submit. The server prices the order, refuses an out-of-stock, unpublished or archived product, refuses
   a suspended account **inside the transaction**, and writes the order, its items, its contact and its
   `order_placed` event together.
4. The confirmation page states that cash is paid to the courier on delivery. The order appears in the
   customer's own order list and never in anyone else's.

### The owner journey

1. The order appears in **`/admin/orders-cod`**, oldest first, with the total and the delivery contact.
2. The owner **calls the customer**. Nothing is automatic: no message is sent and no state changes on its
   own.
3. The owner **approves** - `cod_approved`, order `confirmed`, one `cod_approved` event and one
   `cod.approved` audit record - or **rejects** with a required reason, which cancels the order while it
   is still `pending` and writes `cod.cancelled`.
4. Both transitions are guarded in the SQL `WHERE` clause on prior state, so a double click or two racing
   requests produce exactly one decision; the loser reads a conflict. The order leaves the queue.
5. **No decision bans a customer.** A ban is a separate, reasoned, audited owner action on
   `/admin/customers`, which revokes live sessions and refuses future orders inside the order transaction
   (D20).

### What is deliberately not modelled yet

- **Delivery charges.** Unconfigured: `shipping_minor` is `0`, the storefront says delivery is arranged on
  confirmation, and the owner has not supplied prices, areas or matching rules.
- **Courier and consignment records.** No courier API is authorized and no consignment field is written.
- **Cash collection and reconciliation below `cod_approved`.** `cod_collected`, `cod_failed` and
  `cod_reconciled` exist in the schema and have no screen or transition yet.
- **Cancellation and refund workflows.** Refunds remain manual and, in this release, are recorded only if
  the owner records them by other means; no refund UI exists.
- **Any notification.** There is no mail, SMS or push provider; the customer's own order page is the
  record.

### Future online payment - not authorized, not designed

An automated gateway is a **future roadmap item**. No provider is selected, no fee or settlement model is
agreed, and no SDK, credential, webhook, endpoint or abstraction exists or may be added in advance. When
the owner approves one, that work must:

- verify authenticity server-side (signature or server-to-server confirmation), never trust a browser;
- key idempotency on the provider's own event id, with replay protection;
- match amount, currency and reference server-side before marking anything paid;
- keep payment, fulfilment, COD and refund state **separate**, as the schema already does; and
- record every decision append-only with actor, timestamp and reason.

---

## Historical design (superseded 2026-10-17)

The numbered sections below describe the manual bKash/Nagad verification model that **no longer exists in the
application**. They are kept because they record *why* the schema has `payment_recipient`,
`payment_claim`, the prepaid `payment_state` values and their constraints, and because a future gateway
decision must not repeat the mistakes they document. **Do not read them as current product behaviour, and
do not implement them.**

## 2. Payment methods

Stored as an explicit enum on the order, not as free text. The **implemented** values are `bkash`, `nagad` and `cod` (`order.payment_method`). There is no `gateway` value: an automated provider is not authorized (D7), so no such value is written and the extension point stays unused.

| Value | Meaning | Launch status |
| --- | --- | --- |
| `bkash` | Manual bKash transfer to the owner's configured number | **APPROVED** (D7) |
| `nagad` | Manual Nagad transfer to the owner's configured number | **APPROVED** (D7) |
| `cod` | Cash on delivery | **APPROVED** (D7) - a distinct method, see below |

The **recipient numbers and account labels** are stored as owner-configured rows in `payment_recipient` (one active recipient per method, format-checked), not as free text in the storefront. The **actual numbers and customer-facing instruction wording are owner inputs that do not exist yet** (`docs/decisions/0014-...` Part 5); nothing is hardcoded and no example number may be invented.

### COD is a distinct approved method, not a variation of this flow

Cash on delivery is **approved (D7)** but is modelled as a **separate payment method with its own lifecycle**, because it is a different commerce model rather than an extra payment option. The prepaid verification flow in this document does **not** apply to COD orders - there is no customer transaction to verify.

The following consequences are **in scope** and are now approved (13.7 and 13.9.3):

| Area | What COD changes |
| --- | --- |
| Order confirmation | COD orders are confirmed without any payment verification step. The verification queue does not apply to them at all |
| Delivery | The courier collects cash, so the courier relationship becomes a **cash-handling** relationship with its own settlement terms |
| Failed delivery | A refused or undeliverable parcel returns stock and creates a remittance question. This needs explicit states, which do not exist for prepaid orders |
| Reconciliation | Cash arrives via courier settlement, on the courier's schedule, minus their charges. It reconciles against a statement, not against a customer transaction |
| Risk | The merchant absorbs non-delivery and refusal risk, and a repeated-refusal pattern is a business cost with no prepaid equivalent |
| Customer identity | COD raises the value of a phone-number check, since the parcel is handed over against payment |

**Status:** COD is **approved for launch (D7)**, and the owner's rule that every COD order is **manually approved from the dashboard before dispatch** is approved (13.7). There is no prepaid verification step for COD.

**Approved (13.9.3):** COD cancellation before and after dispatch, refused and undeliverable parcels, return-to-store handling, and cash reconciliation against courier settlement. **Delivery completion, cash collection and cash reconciliation are separate states**; COD cash is never treated as collected before it is collected.

## 3. Order status and payment status are separate

Conflating these is the single most common source of confused order handling. They are two independent enums.

**`order.status`** - where the order is in fulfilment:

`pending` → `confirmed` → `processing` → `shipped` → `delivered` → `completed`, with `cancelled` and `returned` as terminal or side states.

**`order.payment_state`** - where the money is (the schema name; earlier revisions called this `payment_status`):

| Value | Meaning | Set by |
| --- | --- | --- |
| `awaiting_payment` | Order placed; customer has not yet submitted payment details | System, at order creation |
| `awaiting_verification` | Customer submitted details; **no human has reviewed them yet** | System, on submission |
| `verified` | An authorized person independently confirmed receipt | **Admin only** |
| `rejected` | Reviewed, but receipt could **not** be confirmed. **Not an accusation** | **Admin only** |
| `falsely_claimed` | Admin **confirmed** the payment claim was false - a fake-order finding | **Admin only** |
| `expired` | An order with **no submitted payment claim** lapsed 24 hours after placement (13.9). **Deferred: no expiry job is written (ADR 0014)** - the value exists in the enum, but nothing writes it at launch | System, on the approved expiry rule |

The `cod_*` values are **not** in this enum. They live in the separate **`order.cod_state`** column (`not_applicable`, `cod_pending_approval`, `cod_approved`, `cod_collected`, `cod_failed`, `cod_reconciled`), so COD approval and cash handling are never read as a prepaid money state (see §3's note and `docs/data-model.md` 7.1, 11.6).

**Refund state is not part of this enum.** It is a **separate table**, `refund`, with `refund.state`: `requested` / `processing` / `completed` / `failed` (13.6). (Earlier revisions described an `order.refund_status` field; no such field exists.) A payment is never described as refunded because a refund was requested.

**COD is modelled as its own state field, not inside the payment enum (Phase 10 design, implemented).** The approved COD state names are preserved exactly and live in `order.cod_state`, because COD approval is an **authorization to dispatch** rather than a money fact, and because collection, delivery and reconciliation are separate events (13.7). A COD order has no MFS payment state at all (`payment_state = 'not_applicable'`). See `docs/data-model.md` sections 7.1 and 11.6. **No approved COD state, meaning or rule changes** - only which column carries it.

The storefront can move payment state to `awaiting_verification` at most, and it does so by **submitting a claim, not by asserting a state**. **Every other transition is an authenticated administrative action.** No client request can set a paid or fake state, and no code path derives one from a customer-supplied value. `expired` is the one system transition in the enum, and **it is deferred: no expiry job is written (ADR 0014)**.

`rejected` and `falsely_claimed` are **different facts**. `rejected` means receipt could not be confirmed, which includes a delayed transaction or a mistyped reference. `falsely_claimed` means an admin **confirmed** the claim was false. Only the latter may flag the customer account for review, and it is never set automatically.

Order fulfilment does not begin on `awaiting_verification`. The owner's rule for when an order may move to `confirmed` (on payment verification, or on dispatch for COD) is a business decision - see §13.

## 4. Customer workflow

0. **Authentication is required before ordering (D12).** A guest may browse and build a cart, but on proceeding to checkout is presented with login or registration. The **cart is preserved** across authentication and the customer is **returned to checkout** on success. No order exists before this step.
1. Customer completes checkout and supplies order and delivery details.
2. The storefront displays the payment instructions and recipient details **from owner configuration**.
3. The customer completes the transfer externally, in their own bKash/Nagad app.
4. The customer submits the transaction reference and the required details in the checkout form.
5. The order is recorded with `payment_state = awaiting_verification` (with the claim row written in the same transaction - see §6 and ADR 0014 Part 3.3).
6. Authorized staff review the submission and **independently verify the transaction** through the merchant account or provider record.
7. Staff explicitly mark the payment `verified` or `rejected`, with a reason where appropriate. Where an admin **confirms** the claim was false, the payment is marked `falsely_claimed` and the customer account may be flagged for review - never automatically, and never merely because a transaction was delayed or a reference was mistyped.
8. Order progression follows the approved payment and fulfilment rules. If the payment is not verified within the **24-hour maximum**, the order enters the exceptions queue (13.2). **No reservation is held at launch (ADR 0013)**, and the claim **never expires and is never released by a timer** (ADR 0014 decision 11).

The customer is told plainly, at step 2 and again at step 5, that payment is **pending manual verification** and that this is not instant. Setting that expectation is part of the workflow, not a nicety - a customer who expects instant confirmation will submit duplicate payments.

**COD orders skip steps 2-6 entirely.** They are placed without a transfer and without a verification step, so the prepaid verification flow does not apply to them. The owner **manually approves** each COD order from the dashboard before dispatch (13.7). COD cancellation, delivery failure, refused parcels and reconciliation are approved in **13.9.3**.

## 5. Data captured, and data never captured

### Captured (minimum necessary)

**Approved field set (D8):**

| Field | Required? | Purpose |
| --- | --- | --- |
| Payment method (enum) | **Yes** | Which account to check |
| **Sender mobile number** | **Yes - required** | Identifies the paying account so the verifier can match the transaction |
| **Transaction ID / reference** | **Yes - required** | To find the transaction in the merchant record |
| Amount claimed | **Yes** | To compare against the order total. Recorded, never trusted |
| Payment screenshot | **No - not required** | Not collected, not requested |
| Submitted timestamp | System-generated | Ordering and expiry |

Recipient account details are **owner-configurable settings**, never hardcoded into application code.

Nothing beyond this is collected. In particular, no screenshot is requested, no account number is requested, and no customer identity document is requested.

### Never captured or stored

- **PINs, OTPs, passwords or any MFS credentials.** No exception.
- Customer bKash/Nagad account credentials - never requested.
- Full account numbers where a partial or none is sufficient.
- Any provider secret key or merchant credential in the storefront, the client bundle, logs or documentation.

### Screenshots

**Approved (D8): screenshots are not required.** They are not requested and not stored. The sender mobile number and transaction reference are sufficient for independent verification, and not collecting customer financial imagery removes a whole class of retention and breach exposure.

The controls below are **not active**; they are retained only so that, if the owner later reverses this decision, the requirements are already documented rather than improvised.

If the owner elects to accept them, these controls are **required**, not optional:

| Concern | Requirement |
| --- | --- |
| Storage | **Private bucket only.** Never publicly readable, never served through the storefront's image path |
| Validation | Content type and size checked server-side; the file decoded as an image before acceptance; server-generated object key, never the uploaded filename |
| Access | Readable only by roles permitted to verify payments, through an authenticated, authorized route |
| Retention | Deleted on a defined schedule after verification completes and the dispute window passes - not kept indefinitely |
| Deletion | The deletion is recorded, and the customer is told the retention period before uploading |
| Status | Treated as a **claim**, never as evidence. A screenshot never marks a payment verified |

**A screenshot is not proof of payment** any more than a transaction reference is. It is a convenience for the customer and a hint for the verifier, nothing more.

## 6. Server-side validation of submissions

The submission endpoint validates, at the server boundary:

- The order exists and belongs to the submitting session.
- The order's payment status is `awaiting_payment`, or `rejected` where the customer is submitting a corrected claim. **These are the only two states that accept a submission.** A resubmission cannot overwrite a completed decision, and an order with an active `submitted` claim cannot accept a second one (13.10.7).
- The method is an enabled method.
- The transaction reference is present, trimmed, and within a bounded length and character set.
- The claimed amount is a positive integer in poisha and is **recorded, not trusted**.
- Rate limits apply per order and per source.

**The claimed amount never overrides the order total.** The order total is authoritative from the database. A mismatch is a flag for the verifier, not an automatic acceptance or rejection.

## 7. Admin verification queue

Detailed module scope is in `docs/admin-dashboard.md`. Requirements:

- A queue of orders in `awaiting_verification`, oldest first, with the age of each clearly shown.
- Each row shows: order reference, order total, claimed amount, method, transaction reference, sender number (if given), and time since submission.
- **Duplicate-reference detection:** if the same transaction reference has been submitted against more than one order, both are flagged before a decision is made.
- **Actions: verify, hold, reject and mark falsely claimed.** Verify records an actor and the confirmed amount; reject and mark-falsely-claimed both require a reason. The reason is mandatory for rejection and for a false-claim finding, and optional for verification, which asserts a confirmed fact. (An earlier revision said "two actions only"; that predates the D9 fake-order rule and is superseded.)
- **Hold (ADR 0014 decision 6):** a claimed amount that does not match the order total lets the owner **hold the order for manual investigation**. A mismatch never auto-approves and never auto-rejects. The claim stays in the queue and cannot expire; the representation of the hold (an open `payment_mismatch` operational exception, or a new `held` state) is an owner choice recorded in ADR 0014 Part 3.2 / Part 5.
- A mismatch between claimed and order total is surfaced prominently and requires an explicit acknowledgement.
- The queue shows no customer data beyond what the verification task requires.

## 8. Verification and rejection, and the audit record

Every decision writes an append-only audit record containing:

| Field | Notes |
| --- | --- |
| Order reference | The subject of the decision |
| Decision | `verified` or `rejected` |
| Actor | The authenticated staff identity - never a free-text name |
| Timestamp | Server time, not client-supplied |
| Reason | Required on rejection; optional on verification per policy |
| Prior status | The state the decision moved from |

Requirements:

- **Idempotent transitions.** A repeated action (double click, retry, concurrent tab) does not create a second decision or a duplicate audit entry. The transition is guarded by the expected prior state, so the second attempt is a no-op rather than a conflict.
- **Authorization is server-side, per request.** Verifying a payment is a permissioned action. Hiding the button is not access control.
- **No payment status is writable from the storefront** by any route, including a forged or replayed request.
- The audit log records the decision, not the customer's financial details. The reference is stored on the payment record where it is operationally needed; it is **not** duplicated into general application logs.

## 9. Customer-facing states

| Payment status | What the customer sees |
| --- | --- |
| `awaiting_payment` | Instructions and recipient details, with the amount due and a clear statement that payment is manual |
| `awaiting_verification` | "We have received your payment details and are verifying them. This is done manually and is not instant." Plus what to do if they made a mistake. |
| `verified` | Confirmation that payment is confirmed, and what happens next |
| `rejected` | Plain explanation, the reason where appropriate, and the recovery path (resubmit with correct details, or contact support) |
| `falsely_claimed` | That the payment claim could not be confirmed and the order was not accepted |
| `cod_pending_approval` | That the order is placed and awaits owner approval before dispatch |
| `cod_approved` | That the order is approved and will be dispatched |
| `cod_collected` | That the order is complete and cash was received |
| `cod_failed` | That delivery did not complete, and what happens next |
| `expired` | The order lapsed. **Deferred (ADR 0014):** no expiry job is written, and under ADR 0013 no stock is reserved, so "held stock released" and any revival-by-stock language no longer applies |
| *(display label, not a status)* | **Verification delayed** is a **derived queue label** for an order still in `awaiting_verification` past the 24-hour maximum. It is **not** a payment status value, and no order is ever stored in a state of that name. The customer is told that verification is taking longer than usual, that the order is still held, and that no action is needed |

**Refund state is shown from `refund.state`, not from `payment_state`:** requested, processing, completed or failed - the **actual** state, never "completed" merely because a refund was requested or approved.

The customer can always see the order's current payment status. A pending order must never look confirmed, and a rejected order must never look lost.

**Order status requires an account (D12, approved).** Because ordering requires authentication, a customer reaches their orders **through their own authenticated account**. There is no anonymous order-lookup surface. Requirements:

- Order views are scoped to the authenticated customer; a request for another customer's order is refused **server-side**, not merely hidden in the UI.
- Sessions are server-side, in httpOnly, `Secure`, `SameSite` cookies, with a bounded lifetime.
- Login, registration and account recovery are **rate limited** and return generic failures, so accounts and recovery tokens cannot be enumerated.
- Account recovery uses single-use, expiring tokens delivered to the verified contact channel. **Not implemented at launch (ADR 0012, ADR 0014 decision 9):** no delivery channel is authorized, so there is **no self-service recovery** and the interface states the gap rather than offering a reset that does not exist.
- Order references remain long and non-sequential as defence in depth, but they are no longer the access control.
- The cart is preserved across the authentication step, so requiring an account does not lose the customer's selection.

## 10. Retention and minimization

- Payment reference and decision are retained as long as the order requires for accounting and dispute resolution, per the owner's policy.
- Screenshots, if collected, are **deleted on a defined schedule** once verification is complete and the dispute window has passed.
- Logs exclude payment references, sender numbers and customer contact details.
- Retention periods are a business decision requiring owner input, and must be stated in the storefront's privacy information.

## 11. Threat model

Controls below are **requirements, not implemented work**. None exists yet.

| # | Threat | Required control |
| --- | --- | --- |
| T1 | Customer submits a fabricated transaction id | Payment is never auto-verified. Status changes only through an authorized human decision after independent confirmation |
| T2 | One transaction reference reused across multiple orders | Duplicate-reference detection flags all affected orders for review before a decision. A hard block is not used, because legitimate mistyping exists |
| T3 | Forged or replayed request sets payment status | Payment status is server-side only; the storefront has no writable path; transitions are state-guarded and idempotent |
| T4 | Unauthorized or insider misuse of verification | Permissioned action, server-side authorization per request, actor identity and reason recorded, append-only audit |
| T5 | Order marked paid without money received | Periodic reconciliation of verified payments against the merchant statement, with a documented discrepancy procedure |
| T6 | Sensitive customer financial data over-retained or leaked | Minimisation, defined retention, no PIN/OTP/credential storage, logs exclude references and personal data |
| T7 | Uploaded screenshot abused as an attack vector | Private storage, access control, type and size validation, treated as untrusted input. Recommendation: do not collect screenshots at launch |
| T8 | Submission endpoint abused or enumerated | Rate limiting per order and per source; bounded input lengths |
| T9 | Customer claims payment that cannot be found | Documented recovery path: the order **stays in `awaiting_verification`** and enters the exceptions queue past the 24-hour maximum. It is **never auto-expired** - a submitted claim never expires (13.9.2). Under ADR 0013 no stock is reserved, so nothing is held. An authorized person resolves it explicitly: verify, reject with an explanation, or escalate to support |
| T10 | Verification performed by an unqualified person | Role-based permission; only named roles may verify. Role list is an owner decision |

## 12. Automated gateways - not authorized

Explicitly **not authorized**, and not to be implemented, provisioned or onboarded: SSLCommerz, automated bKash/Nagad APIs, payment webhooks, automatic payment confirmation, automated refund processing.

The manual workflow is designed to be complete and secure **without** them, so nothing about launch depends on a future gateway.

### What changes when a gateway is approved later

The extension point is the payment record and the payment-status enum - not a pre-built abstraction. When a gateway is added:

| Concern | Change |
| --- | --- |
| Method | A new enum value such as `gateway` becomes writable, with a provider reference |
| Status source | `verified` may be set by a **signature-verified webhook** or an explicit server-side verification call, in addition to the existing manual path |
| Webhook authentication | Signature verification against the provider secret, held server-side only |
| Idempotency | Webhook processing keyed on the provider's event id, so replays are no-ops |
| Matching | Amount, currency and order reference are matched before any state change |
| Reconciliation | A **manual, owner-driven** comparison of provider settlements against recorded claims, flagging mismatches. **No scheduled job is added (ADR 0014)**; the cadence is an owner input |
| Failure handling | Timeout and uncertain outcomes resolve by re-querying the provider, never by assumption |
| Refunds | Provider refund API replaces the manual refund record |

No abstraction layer is built now for this. The manual workflow uses the same payment record, the same status enum and the same audit trail, so the gateway path is an addition rather than a rewrite. Building a provider-abstraction framework before a second provider exists would be speculative complexity.

## 13. D9 - approved payment and order policy

**Status: D9 is APPROVED.** Every rule below is **approved and binding on implementation**, including the policies in 13.9 for unpaid-order expiry, cancellation after the 24-hour window, and the COD lifecycle.

**D11 is APPROVED** - the allocation rule and its bound are decided in 13.10.

### 13.1 Approved - prepaid verification window

- Customers pay by **manual bKash or manual Nagad** (D7), supplying the **sender mobile number and transaction reference**; screenshots are not required (D8).
- The owner verifies authenticity manually from the dashboard.
- **The owner has up to 24 hours from order placement to verify.** This is a **maximum, not a promise** - normal operations are expected to be much faster.
- **The 24-hour maximum is an internal service maximum, not a customer-facing commitment.** The storefront tells the customer that verification is manual and not instant; it publishes no deadline and no turnaround promise.
- The dashboard must distinguish, at minimum: **awaiting payment**, **payment submitted / awaiting verification**, **verified**, **rejected / unverified**, and **fake-order finding**.

### 13.2 Approved - genuine payment that cannot be verified within 24 hours

A possible legitimate payment is **never silently discarded**:

- The order does **not** expire automatically.
- It moves to an **exceptions queue** (`verification overdue`) in the dashboard, sorted above newer submissions.
- **Nothing releases it on a timer, because a genuine payment may exist.** (Under ADR 0013 no stock is reserved at launch, so there is no reservation to hold or release; the guarantee that matters is that **the claim is never touched by a timer**.)
- The customer sees that verification is still in progress and that no action is needed.
- The owner must resolve it explicitly: **verify** (payment found), **reject** (payment not found - the order may then expire under the expiry rule), or **escalate to support** (money confirmed received but the order cannot be fulfilled, which leads to a manual refund).
- The resolution is recorded with actor, timestamp and outcome.

### 13.3 Approved - false payment claims and fake orders

- A customer who claims to have paid but whose payment cannot be verified **must not** have the order marked as paid.
- Where the owner **confirms** that the claim was false, the owner may mark the order as a **fake order** and **flag the associated customer account for review**, preserving an auditable **reason and actor**.
- **A delayed transaction or a mistyped reference is not evidence of fraud.** `falsely_claimed` and the customer review flag are **admin-set only** and are never derived automatically by the system.
- The customer flag is **independent of the order's payment status**: it records a concern for review, and does not by itself block or close the account.
- **The flag and a ban are different actions and must not be collapsed (D20, approved in ADR 0009).** The flag marks a concern and blocks nothing. A **ban** is a separate owner action, available only after a **confirmed** fake order, which withdraws the account's ability to transact: sessions are revoked, new orders are refused inside the order transaction, and checkout is refused. A ban does **not** cancel, refund or delete an existing order, and it changes no payment, refund or reservation state. Enforcement boundary: `docs/security.md`; account transitions: `docs/data-model.md` 4.1.

### 13.4 Approved - ordinary unpaid orders versus confirmed false claims

- If the customer **never claimed** payment, the order is an **ordinary unpaid order**, subject to the expiry policy (13.9).
- If the customer **claimed** payment and the owner verifies that none was received, the owner marks it **not paid / fake as appropriate**, and the order **expires immediately** on that explicit decision.
- These are **different facts** and must remain distinguishable in the data. An unpaid order is not a fraud signal.

### 13.5 Approved - cancellation

- A customer may cancel **within 24 hours of placing the order**, under the owner's rule.
- Cancellation is requested **through support with the order ID**. Support handles the request and follow-up.
- **The customer does not cancel or refund self-service**, and no refund is initiated from the storefront.

### 13.6 Approved - refunds

- Refunds are processed **manually through support**, never automatically through a payment API.
- The owner manually updates the refund status in the dashboard **after the real-world action**.
- **A dashboard status must never say a refund is completed merely because it was requested or approved.** Separate states are required: `requested`, `processing`, `completed`, `failed`.
- Refund state lives in the separate **`refund` table** (`refund.state`), independent of `order.payment_state` and `order.status`.

### 13.7 Approved - cash on delivery

- COD is an approved, **distinct** payment method (D7).
- The owner **manually approves** each COD order from the dashboard **before dispatch**.
- COD has **no** sender-number or transaction-reference requirement and **no** prepaid verification step. The prepaid queue does not apply to it.
- Cash collection, delivery completion, failed delivery, refused parcels, returns and reconciliation are **distinct states**.

### 13.8 Approved - state separation (binding)

These concepts are **never collapsed into one field**:

1. `order.payment_state` - where the prepaid money is.
2. `order.status` - where fulfilment is.
3. `order.cod_state` - COD approval, cash collection and reconciliation.
4. `refund.state` - where the refund is (`requested` / `processing` / `completed` / `failed`), in its own table.
5. Inventory reservation state - `held` / `consumed` / `released`. **Implemented and unused (ADR 0013).**
6. Customer review flag - a concern for review, set by an admin, separate from all of the above.

(An earlier revision listed five concerns using the vocabulary `payment_status` / `refund_status`. The schema separates six; the extra one is `cod_state`, which is never read as a prepaid money state.)

Also distinct: the **24-hour verification maximum** (how long the owner has to verify) and the **24-hour cancellation window** (how long the customer may request cancellation from placement) are different rules that happen to share a duration. They must not be presented as one thing.

### 13.9 Unpaid-order expiry - **deferred (owner decision 2026-10-11; amended 2026-10-16)**

> **Amended by ADR 0014 (owner-decided, 2026-10-16): the automatic expiry timer is not a launch priority.** **No scheduler, cron, job runner or expiry infrastructure is added now.** The rules below remain the design for whenever expiry is scheduled - but the only part that binds Phase 16 today is the second one: **an order whose customer has submitted a payment claim must never expire automatically.** The `expired` enum value is not written at launch, and there is no expiry sweep.

Expiry, when scheduled, applies **only** to an order whose customer has **never submitted a payment claim**.

1. **Duration: 24 hours from order placement.** An order still in `awaiting_payment` 24 hours after placement expires. *(Deferred: no job performs this at launch.)*
2. **A submitted claim never expires.** An order in `awaiting_verification` is **never** expired by a timer and is **never** released automatically, because a genuine payment may exist (13.2, 13.10.8). It stays in the exceptions queue until an explicit admin decision. **This rule binds now, and it is made structural by the claim being written in the same transaction that moves the order to `awaiting_verification`** (ADR 0014 Part 3.3).
3. **Confirmed false claim.** Where the owner **confirms** a claim was false, the owner rejects it and the order is cancelled **immediately on that explicit decision** (13.10.5). Under ADR 0013 there is no reservation to release.
4. **Revival is checked, never assumed.** An expired order may be **recreated or reactivated only after re-checking current product availability** (ADR 0013). Nothing is silently revived. If the product is out of stock, the customer is told plainly rather than sold a unit that does not exist.
5. **Expiry is recorded and visible when it exists.** The transition writes the reason and timestamp, and the customer is told the order lapsed. *(Deferred with the timer.)*

**The 24-hour window is an internal service rule, not a customer-facing promise.** The storefront publishes no deadline.

### 13.9.1 Customer notifications (approved baseline)

| Event | Customer is told |
| --- | --- |
| Details submitted | Verification is pending, manual and not instant |
| Verification delayed past the maximum | Still in progress, no action needed |
| Verified | Payment confirmed, and what happens next |
| Rejected / unverified | Plain reason, and the recovery path |
| Fake-order finding | That the claim could not be verified and the order was not accepted |
| Expired | The order lapsed. *(Deferred: no expiry job is written, ADR 0014.)* |
| Refund requested / processing / completed / failed | The **actual** refund state, never an optimistic one |
| COD placed | That the order awaits owner approval before dispatch |

**Baseline: the customer's authenticated order page.** Email or SMS notifications require a provider and are **not assumed** - they are a separate owner decision with its own cost. The customer must be able to see their status without waiting for a message.

### 13.9.2 Approved - cancellation after the 24-hour window (owner decision, 2026-10-11)

- Cancellation is always requested **through support with the order ID**. There is no customer self-service cancellation (13.5).
- **Before dispatch**, a cancellation may be approved through the documented support workflow, including after the 24-hour window. Approval records actor, timestamp and reason. (Under ADR 0013 no reservation is written, so there is no stock ledger entry to make; the order is cancelled and, where money was received, refunded manually.)
- **After dispatch**, the request is **not** an ordinary pre-dispatch cancellation. It is handled as a **delivery cancellation / return case**, and an order already with the courier follows the documented delivery and return process.
- **Prepaid refunds remain manual through support** (13.6). The owner updates `refund.state` **only when the corresponding real-world action is confirmed** - never on request or approval.
- Stock returns to sellable only after physical receipt and inspection (13.10.10).

### 13.9.3 Approved - COD lifecycle (owner decision, 2026-10-11)

- **Owner approval is required before dispatch** (13.7). An unapproved COD order is never dispatched.
- **Before dispatch**, cancellation goes through support, exactly as for a prepaid order.
- **After dispatch**, the case follows the **delivery cancellation / return workflow**, not ordinary cancellation.
- **Failed delivery or customer refusal** leads to **return-to-store handling**. The parcel is not treated as sellable product until it is physically back at the store and inspected.
- **Returned products become sellable only after physical receipt and inspection.** Goods that fail inspection are written off rather than restored (13.10.10).
- **Delivery completion, cash collection and cash reconciliation are separate states and events.** `cod_collected` is set only when cash is **actually collected** - never on approval, dispatch or a delivery attempt. Cash is reconciled against the courier statement, never assumed.

### 13.10 D11 - inventory reservation and release (APPROVED)

**Status: approved, and superseded in effect for launch.** The owner's core rule is recorded and the engineering invariants remain binding on any future reservation work, but **the reservation mechanics below are unused at launch** (ADR 0013) and the **per-unit allocation bound has no unit to attach to** while nothing is reserved. The **payment-claim** rules that still bind Phase 16 are: a submitted claim is never expired, never preempted and never released by a timer, and at most one active submitted claim exists per order.

> **Amended by ADR 0013 (owner-decided, 2026-10-15): availability is the only ordering gate.** Order creation writes **no** reservation, allocation, deduction or automatic availability change, and **overselling is accepted** rather than prevented. The reservation and allocation mechanics described in 13.10.1-13.10.6 are therefore **not exercised at launch**; the D11 inventory tables remain implemented and unused. The payment-priority intent below remains the owner's rule for the payment flow, but it has no stock-ordering implementation while no unit is reserved.

#### The owner's rule

> When only limited stock is available, the customer whose payment is successfully completed/verified first gets the product.

This is a **payment-priority rule**. It is explicitly **not** permission to oversell, and it does not override stock availability.

#### The stock concepts, and the states that are not stock

| Concept | Meaning |
| --- | --- |
| `on_hand` | Physical units the store holds |
| `reserved` | Units held by orders that are neither fulfilled nor released |
| `available` | `on_hand - reserved` - the figure the design's guarded decrement would evaluate. **Not computed or consumed at launch (ADR 0013)** |
| reservation state | Per order: `held` -> `consumed` (fulfilled) or `released` (given up). **Implemented and unused (ADR 0013)** |

`order.payment_state`, `order.status`, `order.cod_state`, `refund.state` and the customer review flag are **separate from stock** and from each other (13.8).

#### 13.10.1 How an order reserves stock while payment is pending

At order creation, the reservation **was designed** to be created in the same transaction and `reserved` incremented by a guarded atomic update that fails when `available < n`. **This is not performed at launch (ADR 0013):** order creation writes no reservation, allocation or deduction, and the `inventory_balance` counter is never updated by the order path.

#### 13.10.2 How verified payment establishes the buyer's allocation

Verification does **not** move stock. Under the design it would clear the reservation's expiry; **at launch there is no reservation to clear (ADR 0013)**. The fact that still holds, and must keep holding: **"payment verified" and "stock consumed" are different facts**, and verification writes no inventory movement.

#### 13.10.3 Concurrent orders for the final unit

This section described a guarded decrement that would make overselling impossible. **It is superseded by ADR 0013:** order creation performs no guarded decrement, and **overselling is accepted and managed operationally.** The `CHECK (reserved <= on_hand)` backstop and the inventory tables remain implemented and **inert**. Two separate valid submissions may therefore each create an order for the same in-stock product.

#### 13.10.4 Earlier order, later verified payment

**Preemption was approved as part of the allocation rule (13.10.7), and requires a unit to preempt. At launch there is no unit and no reservation (ADR 0013), so this transition has no implementation and is deferred with the inventory mechanics.** The rule that survives unchanged: **an order that has submitted a payment claim is never preempted and never released by a timer.**

**Preemption is never safe once a claim exists.** An order that has submitted payment details is **never** preempted and **never** released by a timer, because a genuine payment may exist. Once a unit has a submitted claim, it is committed until an explicit admin decision.

#### 13.10.5 Immediate expiry after a confirmed false payment claim

Marking `falsely_claimed` is an explicit **admin** action, not a timer. It cancels the order and flags the customer for review. Under the design it also released the reservation; **at launch no reservation exists (ADR 0013)**. Because the claim was confirmed false, **no genuine payment exists**, so ending the order immediately is safe. It is recorded with actor, reason and timestamp.

#### 13.10.6 Eligible cancellations without double release

This described the single state-guarded reservation release. **It is unused at launch (ADR 0013):** nothing writes `stock_reservation` or `inventory_movement`, so there is no release to guard. The *pattern* - one guarded `UPDATE ... WHERE <expected state>`, idempotent by construction - is still the pattern the claim and order transitions must follow (ADR 0014 Part 3.2).

#### 13.10.7 The allocation rule - ANSWERED by the owner

**Owner's decision (2026-10-11), recorded verbatim:** *"the customer who first paid (like place order with transaction id and number) will get the product"*.

**Interpretation recorded.** Priority is decided by the **order in which payment claims are submitted** - not by order placement time, and not by the owner's verification time. This is the workable reading because the owner cannot observe the true transfer time without inspecting each record, and submission is the moment the customer has demonstrably acted. **The per-unit *effect* of this rule is deferred with the reservation mechanics (ADR 0013, ADR 0014):** with no unit reserved, priority governs the order of the verification queue, not the allocation of a contested physical unit.

**Consequence - this is the payment-priority model (Model B), and it has a real cost.**

For the rule to be operative, a later customer must be able to order and claim a unit that an earlier, still-unsubmitted order is holding. Therefore:

- An order **may be accepted** for a unit already held by an order that has **not yet submitted** a payment claim.
- The unit is allocated **atomically to the first submitted claim**.
- A later claim loses. If that customer had already transferred money, they must be **refunded manually through support** - the accepted cost of the priority rule, and the reason the refund path in 13.6 exists.
- **Design mitigation (required):** claim the unit **at submission, before showing payment instructions**, so a customer learns the item is gone *before* transferring rather than after. This narrows the refund window but cannot close it, because manual transfer always precedes submission.

**Decided - the bound (owner, 2026-10-11).** **At most one active submitted payment claim per unit.** Once a unit carries a submitted claim, **no further claim is accepted for it**, and the storefront stops offering that unit for payment-claim submission while the claim is live.

This is the narrowest bound that still satisfies the owner's rule. Under it the race produces **one winner and, at most, one never-paid loser**: a second customer who transferred before the first claim was submitted must be refunded manually through support (13.6). Because the second claim is refused **before payment instructions are shown**, the customer learns the item is gone before transferring.

#### 13.10.8 Pending verification, delayed review, genuine late payment

An order awaiting verification is **never released by a timer**, because a genuine payment may exist. Past the 24-hour maximum it enters the exceptions queue (13.2). Only an explicit admin decision - verify, reject, false claim, or cancel - resolves it. **This is the rule that binds Phase 16.** The sentence "still wins the unit if it is still held" no longer has a stock implementation: under ADR 0013 no unit is reserved, so a late verified payment wins its own order, not a contested unit.

#### 13.10.9 COD stock

Under the design, owner approval confirmed the COD reservation and cleared its expiry. **At launch no reservation is written (ADR 0013)**, so approval is purely the authorization to dispatch (`cod_state: cod_pending_approval -> cod_approved`). On successful delivery with cash collected, `cod_state` becomes `cod_collected`. On failed delivery, refusal or return, the goods are **not** returned to sellable product on the delivery event.

**Where the "pending inspection" fact lives (Phase 10 clarification).** The pending-inspection fact belongs to the **return record** (`customer_return`), which can later post a restock movement after physical receipt and inspection (13.10.10). It was deliberately placed there rather than on the reservation, whose three states (`held` / `consumed` / `released`) have no meaning for "possibly coming back". **At launch the reservation half of this note is moot** - no reservation exists (ADR 0013) - but the return-record placement still stands: "goods are with a courier" is never "stock is available". See `docs/data-model.md` sections 6.3 and 11.7.

#### 13.10.10 Returned goods

**Stock is restored to sellable only after the goods are physically received and inspected by an admin.** The transition records actor, timestamp and outcome. Goods that fail inspection are written off rather than restored. This applies equally to prepaid returns and COD refusals, and prevents the ledger from claiming sellable stock that is still with a courier or a customer.

#### Engineering invariants (binding, whichever model is chosen)

1. Reservation and availability checks are **atomic**.
2. Concurrent orders **never oversell**.
3. Release is **idempotent** and guarded by valid state transitions.
4. **No automatic release solely because a verification deadline passed** while a genuine payment may exist.
5. The database **prevents two customers owning the same final unit**.
6. Every allocation, release, adjustment and restoration is **auditable**.
7. Payment verification, order cancellation, refund status and inventory release are **never the same state**.
8. **No expiry jobs or automatic stock-release logic are implemented in Phase 9** - and, per **ADR 0014**, **none is added now**: the expiry timer is deferred and is not a launch priority.

## 14. Honest limitations

- This document records approved decisions (D7, D8, D9, D11, D12). **The customer account and order-creation foundation now exists** (Phase 15, local only), and the **schema** for claims, recipients, refunds and settings exists (Phase 11). **The payment flow itself - instructions, claim submission, verification queue and delivery charges - is not implemented.**
- No merchant account, provider arrangement or onboarding has been initiated or verified.
- No MFS provider documentation was consulted for this design, because the launch model deliberately depends on **no provider API**. If a gateway is later approved, its documented contract must be read before that design is written.
- Nothing here establishes that the workflow is secure. Every control in §11 is a requirement awaiting implementation and verification.
- **D9 is approved.** Approved: the 24-hour verification maximum (internal, not a customer promise), exceptions handling for late genuine payments, fake-order findings with audited reasons, cancellation through support, manual refunds with separate requested/processing/completed/failed states, COD owner approval before dispatch, the state separation, and the policies in 13.9 - **cancellation after the window as a pre-dispatch support decision or a post-dispatch return**, and the **full COD lifecycle**. **Amended by ADR 0014:** the 24-hour **unpaid-order expiry is deferred** - it is not a launch priority, no scheduler is added, and the only part that binds now is that **a submitted claim never expires**.
- **D11 is approved.** The allocation rule is the **first submitted payment claim**, and the bound is **at most one active submitted claim per order** (13.10.7). **Superseded in effect by ADR 0013:** with no unit reserved, the rule orders the verification queue rather than allocating a contested physical unit, and **overselling is accepted**.
- Because ordering now requires an account (D12), the customer-authentication design was a launch requirement. **It is now implemented** (Phase 15, local only) on the **D17** model (ADR 0012): first-party email and password sessions, scrypt hashing, hashed opaque tokens, httpOnly cookies, throttling and customer-scoped CSRF. **Still absent:** self-service recovery, an owner-facing ban control, and the owner-operated credential reset. See **ADR 0014** Part 1 decisions 8 and 9.
